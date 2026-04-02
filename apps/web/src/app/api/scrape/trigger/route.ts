import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { enqueueScrapeJob } from '@/lib/queue'

const TriggerSchema = z.object({
  bankAccountId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = TriggerSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId } = parsed.data

  // Ownership check
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id, scrape_status')
    .eq('id', bankAccountId)
    .eq('user_id', user.id)
    .single()
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })
  if (account.scrape_status === 'running' || account.scrape_status === 'awaiting_otp') {
    return Response.json({ error: 'Scrape already in progress' }, { status: 409 })
  }

  // Insert job record
  const { data: job, error: jobError } = await supabase
    .from('scrape_jobs')
    .insert({ user_id: user.id, bank_account_id: bankAccountId, triggered_by: 'manual', status: 'queued' })
    .select('id')
    .single()
  if (jobError || !job) return Response.json({ error: 'Failed to create job' }, { status: 500 })

  await enqueueScrapeJob(user.id, bankAccountId, 'manual')

  return Response.json({ jobId: job.id }, { status: 202 })
}
