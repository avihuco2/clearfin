import { createServerClient } from '@/lib/supabase/server'
import { enqueueScrapeJob } from '@/lib/queue'

export const runtime = 'nodejs'

/**
 * POST /api/scrape/all
 *
 * Enqueues a scrape job for every bank account that is not already running.
 * Can be called from the dashboard "Scrape All" button or programmatically:
 *
 *   curl -X POST https://clearfin-swart.vercel.app/api/scrape/all \
 *     -H "Cookie: <your session cookie>"
 */
export async function POST() {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: accounts, error } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('user_id', user.id)
    .not('scrape_status', 'in', '("running","awaiting_otp")')

  if (error) return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  if (!accounts?.length) return Response.json({ enqueued: 0, message: 'אין חשבונות זמינים' })

  const jobs: string[] = []

  for (const account of accounts) {
    const { data: job } = await supabase
      .from('scrape_jobs')
      .insert({
        user_id: user.id,
        bank_account_id: account.id,
        triggered_by: 'manual',
        status: 'queued',
      })
      .select('id')
      .single()

    if (job) {
      await enqueueScrapeJob(user.id, account.id, 'manual')
      jobs.push(job.id)
    }
  }

  return Response.json({ enqueued: jobs.length, jobIds: jobs }, { status: 202 })
}
