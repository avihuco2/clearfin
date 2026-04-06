import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'
import { enqueueScrapeJob } from '@/lib/queue'

export const runtime = 'nodejs'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const { id } = parsed.data

  // Ownership check — verify account belongs to the authenticated user
  const account = (await sql`
    SELECT id, scrape_status FROM bank_accounts WHERE id = ${id} AND user_id = ${user.id}
  `)[0]
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })

  if (account.scrape_status === 'running' || account.scrape_status === 'awaiting_otp') {
    return Response.json({ error: 'Scrape already in progress' }, { status: 409 })
  }

  try {
    const job = (await sql`
      INSERT INTO scrape_jobs (user_id, bank_account_id, triggered_by, status)
      VALUES (${user.id}, ${id}, 'manual', 'queued')
      RETURNING id
    `)[0]
    if (!job) return Response.json({ error: 'Failed to create scrape job' }, { status: 500 })

    await enqueueScrapeJob(user.id, id, 'manual')

    return Response.json({ jobId: job.id }, { status: 202 })
  } catch {
    return Response.json({ error: 'Failed to create scrape job' }, { status: 500 })
  }
}
