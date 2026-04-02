import { Worker } from 'bullmq'
import cron from 'node-cron'
import { bullConnection } from './lib/redis.js'
import { processScrapeJob } from './jobs/scrape.js'
import type { ScrapeJobData, ScrapeJobResult } from './jobs/scrape.js'

const QUEUE_NAME = 'scrape'
const concurrency = parseInt(process.env['WORKER_CONCURRENCY'] ?? '3', 10)

// ---------------------------------------------------------------------------
// BullMQ worker
// bullConnection is an ioredis instance — the only connection type BullMQ accepts.
// ---------------------------------------------------------------------------

const worker = new Worker<ScrapeJobData, ScrapeJobResult>(
  QUEUE_NAME,
  processScrapeJob,
  {
    connection: bullConnection,
    concurrency,
  },
)

worker.on('completed', (job, result) => {
  console.log(
    `[worker] completed job=${job.id} transactionsAdded=${result.transactionsAdded}`,
  )
})

worker.on('failed', (job, err) => {
  // Log message only — never log the full error object which may contain a stack
  // trace referencing credential variables
  console.error(`[worker] failed job=${job?.id ?? 'unknown'}: ${err.message}`)
})

worker.on('error', (err) => {
  console.error(`[worker] connection error: ${err.message}`)
})

console.log(
  `[worker] started queue=${QUEUE_NAME} concurrency=${concurrency}`,
)

// ---------------------------------------------------------------------------
// Scheduled scraping — every 6 hours, calls the web app's cron endpoint.
// Runs inside Railway so Vercel Hobby plan cron restrictions don't apply.
// ---------------------------------------------------------------------------

const WEB_URL = process.env['WEB_URL']
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
        console.error(`[cron] cron endpoint returned ${res.status}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[cron] fetch failed: ${message}`)
    }
  })
  console.log('[cron] scheduled scrape every 6 hours')
} else {
  console.warn('[cron] WEB_URL or CRON_SECRET not set — scheduled scraping disabled')
}

// ---------------------------------------------------------------------------
// Graceful shutdown on SIGTERM (Railway sends this before container stop)
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] received ${signal} — shutting down gracefully`)
  try {
    // close() waits for active jobs to finish before stopping
    await worker.close()
    console.log('[worker] shutdown complete')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[worker] error during shutdown: ${message}`)
  } finally {
    process.exit(0)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
