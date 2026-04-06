import http from 'node:http'
import cron from 'node-cron'
import { sql } from './lib/db.js'
import { processScrapeJob } from './jobs/scrape.js'
import type { ScrapeJobData } from './jobs/scrape.js'

const concurrency = parseInt(process.env['WORKER_CONCURRENCY'] ?? '3', 10)
const POLL_INTERVAL_MS = 8_000   // poll DB every 8 seconds
const PORT = parseInt(process.env['PORT'] ?? '10000', 10)

// ---------------------------------------------------------------------------
// Health check server — required by Render Web Service.
// Also used by UptimeRobot to keep the free tier from spinning down.
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', activeJobs, uptime: process.uptime() }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(PORT, () => {
  console.log(`[health] listening on port ${PORT}`)
})

let activeJobs = 0

// ---------------------------------------------------------------------------
// DB poller — picks up queued jobs from the scrape_jobs table.
// No BullMQ/Redis required. Any scrape triggered from the web app
// (manual button, cron endpoint) inserts a row with status='queued';
// this loop claims and processes it.
// ---------------------------------------------------------------------------

async function pollAndProcess(): Promise<void> {
  if (activeJobs >= concurrency) return

  const slots = concurrency - activeJobs
  type JobRow = { id: string; user_id: string; bank_account_id: string; triggered_by: string }
  const jobs = await sql`
    SELECT id, user_id, bank_account_id, triggered_by
    FROM scrape_jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT ${slots}
  `.catch((err: unknown) => {
    console.error('[poller] failed to fetch queued jobs:', err instanceof Error ? err.message : err)
    return [] as JobRow[]
  })

  if (!jobs.length) return

  for (const row of jobs) {
    // Claim the job atomically — only process if we can flip it to 'running'
    const claimed = await sql`
      UPDATE scrape_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = ${row.id as string} AND status = 'queued'
      RETURNING id
    `.catch((err: unknown) => {
      console.error('[poller] failed to claim job:', err instanceof Error ? err.message : err)
      return []
    })

    if (!claimed.length) continue   // another worker claimed it first

    activeJobs++
    console.log(`[poller] claimed job=${row.id as string} bankAccountId=${row.bank_account_id as string}`)

    const jobData: ScrapeJobData = {
      userId:        row.user_id as string,
      bankAccountId: row.bank_account_id as string,
      triggeredBy:   (row.triggered_by as 'manual' | 'schedule') ?? 'manual',
    }

    // Run in background — don't await so poller can continue
    processScrapeJob({ id: row.id, data: jobData } as never)
      .then(result => {
        console.log(`[poller] job=${row.id as string} done transactionsAdded=${result.transactionsAdded}`)
      })
      .catch(err => {
        console.error(`[poller] job=${row.id as string} failed:`, err instanceof Error ? err.message : err)
      })
      .finally(() => { activeJobs-- })
  }
}

// Start polling
const pollInterval = setInterval(() => { void pollAndProcess() }, POLL_INTERVAL_MS)
console.log(`[worker] started — polling DB every ${POLL_INTERVAL_MS / 1000}s, concurrency=${concurrency}`)

// Run immediately on start
void pollAndProcess()

// ---------------------------------------------------------------------------
// Scheduled scraping — every 6 hours, calls the web app's cron endpoint.
// ---------------------------------------------------------------------------

const WEB_URL    = process.env['WEB_URL']
const CRON_SECRET = process.env['CRON_SECRET']

if (WEB_URL && CRON_SECRET) {
  cron.schedule('0 */6 * * *', async () => {
    console.log('[cron] triggering scheduled scrape')
    try {
      const res = await fetch(`${WEB_URL}/api/cron/scrape`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      })
      if (res.ok) {
        const body = await res.json() as { enqueued?: number }
        console.log(`[cron] enqueued ${body.enqueued ?? 0} scrape jobs`)
      } else {
        console.error(`[cron] endpoint returned ${res.status}`)
      }
    } catch (err) {
      console.error(`[cron] fetch failed:`, err instanceof Error ? err.message : err)
    }
  })
  console.log('[cron] scheduled scrape every 6 hours')
} else {
  console.warn('[cron] WEB_URL or CRON_SECRET not set — scheduled scraping disabled')
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} — shutting down`)
  clearInterval(pollInterval)
  server.close()

  // Wait up to 30s for active jobs to finish
  const deadline = Date.now() + 30_000
  while (activeJobs > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500))
  }

  // Close DB connection pool cleanly
  await sql.end()

  console.log('[worker] shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT',  () => void shutdown('SIGINT'))
