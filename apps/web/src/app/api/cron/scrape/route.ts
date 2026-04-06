import { NextRequest } from 'next/server'
import { sql } from '@clearfin/db/client'
import { enqueueScrapeJob } from '@/lib/queue'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'

function isValidCronSecret(provided: string): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  try {
    const a = Buffer.from(provided, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) {
      timingSafeEqual(Buffer.alloc(b.length), Buffer.alloc(b.length))
      return false
    }
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || !isValidCronSecret(token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await sql`
    SELECT id, user_id FROM bank_accounts
    WHERE scrape_status NOT IN ('running', 'awaiting_otp')
  `

  if (!accounts.length) return Response.json({ enqueued: 0 })

  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      await sql`
        INSERT INTO scrape_jobs (user_id, bank_account_id, triggered_by, status)
        VALUES (${account.user_id}, ${account.id}, 'schedule', 'queued')
      `
      await enqueueScrapeJob(account.user_id as string, account.id as string, 'schedule')
    }),
  )

  const enqueued = results.filter((r) => r.status === 'fulfilled').length
  return Response.json({ enqueued })
}
