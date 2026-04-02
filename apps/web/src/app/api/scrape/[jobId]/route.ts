import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ParamsSchema = z.object({ jobId: z.string().uuid() })

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(params)
  if (!parsed.success) return Response.json({ error: 'Invalid job id' }, { status: 400 })

  const { data: job } = await supabase
    .from('scrape_jobs')
    .select('id, status, transactions_added, error_message, started_at, finished_at')
    .eq('id', parsed.data.jobId)
    .eq('user_id', user.id)
    .single()

  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 })
  return Response.json(job)
}
