import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
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
      // Still run timingSafeEqual on equal-length buffers to avoid timing leak on length,
      // then return false.
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

  const supabase = createAdminClient()

  const { data: accounts, error } = await supabase
    .from('bank_accounts')
    .select('id, user_id')
    .not('scrape_status', 'in', '("running","awaiting_otp")')

  if (error) {
    return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }

  if (!accounts || accounts.length === 0) {
    return Response.json({ enqueued: 0 })
  }

  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      // Insert scrape_jobs row first so we have a record even if enqueue fails
      const { error: jobError } = await supabase
        .from('scrape_jobs')
        .insert({
          user_id: account.user_id,
          bank_account_id: account.id,
          triggered_by: 'schedule',
          status: 'queued',
        })

      if (jobError) {
        throw new Error(`Failed to insert scrape_job for account ${account.id}`)
      }

      await enqueueScrapeJob(account.user_id, account.id, 'schedule')
    }),
  )

  const enqueued = results.filter((r) => r.status === 'fulfilled').length

  return Response.json({ enqueued })
}
