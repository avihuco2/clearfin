import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { enqueueScrapeJob } from '@/lib/queue'

export const runtime = 'nodejs'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const { id } = parsed.data

  // Ownership check — verify account belongs to the authenticated user
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id, scrape_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })

  if (account.scrape_status === 'running' || account.scrape_status === 'awaiting_otp') {
    return Response.json({ error: 'Scrape already in progress' }, { status: 409 })
  }

  // Insert scrape_jobs row
  const { data: job, error: jobError } = await supabase
    .from('scrape_jobs')
    .insert({
      user_id: user.id,
      bank_account_id: id,
      triggered_by: 'manual',
      status: 'queued',
    })
    .select('id')
    .single()
  if (jobError || !job) return Response.json({ error: 'Failed to create scrape job' }, { status: 500 })

  await enqueueScrapeJob(user.id, id, 'manual')

  return Response.json({ jobId: job.id }, { status: 202 })
}
