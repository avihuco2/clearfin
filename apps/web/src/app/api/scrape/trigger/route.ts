import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'
import { enqueueScrapeJob } from '@/lib/queue'

const TriggerSchema = z.object({
  bankAccountId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = TriggerSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId } = parsed.data

  const accounts = await sql`
    SELECT id, scrape_status FROM bank_accounts
    WHERE id = ${bankAccountId} AND user_id = ${user.id}
  `
  const account = accounts[0]
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })
  if (account.scrape_status === 'running' || account.scrape_status === 'awaiting_otp') {
    return Response.json({ error: 'Scrape already in progress' }, { status: 409 })
  }

  const jobs = await sql`
    INSERT INTO scrape_jobs (user_id, bank_account_id, triggered_by, status)
    VALUES (${user.id}, ${bankAccountId}, 'manual', 'queued')
    RETURNING id
  `
  const job = jobs[0]
  if (!job) return Response.json({ error: 'Failed to create job' }, { status: 500 })

  await enqueueScrapeJob(user.id, bankAccountId, 'manual')

  return Response.json({ jobId: job.id }, { status: 202 })
}
