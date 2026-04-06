import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const ParamsSchema = z.object({ jobId: z.string().uuid() })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid job id' }, { status: 400 })

  const rows = await sql`
    SELECT id, status, transactions_added, error_message, started_at, finished_at
    FROM scrape_jobs
    WHERE id = ${parsed.data.jobId} AND user_id = ${user.id}
  `

  if (!rows[0]) return Response.json({ error: 'Job not found' }, { status: 404 })
  return Response.json(rows[0])
}
