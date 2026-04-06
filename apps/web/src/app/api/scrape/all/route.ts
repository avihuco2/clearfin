import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'
import { enqueueScrapeJob } from '@/lib/queue'

export const runtime = 'nodejs'

export async function POST() {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await sql`
    SELECT id FROM bank_accounts
    WHERE user_id = ${user.id}
      AND scrape_status NOT IN ('running', 'awaiting_otp')
  `

  if (!accounts.length) return Response.json({ enqueued: 0, message: 'אין חשבונות זמינים' })

  const jobIds: string[] = []

  for (const account of accounts) {
    const jobs = await sql`
      INSERT INTO scrape_jobs (user_id, bank_account_id, triggered_by, status)
      VALUES (${user.id}, ${account.id}, 'manual', 'queued')
      RETURNING id
    `
    if (jobs[0]) {
      await enqueueScrapeJob(user.id, account.id as string, 'manual')
      jobIds.push(jobs[0].id as string)
    }
  }

  return Response.json({ enqueued: jobIds.length, jobIds }, { status: 202 })
}
