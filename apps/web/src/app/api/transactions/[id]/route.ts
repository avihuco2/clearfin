import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const ParamsSchema = z.object({ id: z.string().uuid() })

const UpdateSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsParsed = ParamsSchema.safeParse(await params)
  if (!paramsParsed.success) return Response.json({ error: 'Invalid transaction id' }, { status: 400 })

  const body = await req.json()
  const bodyParsed = UpdateSchema.safeParse(body)
  if (!bodyParsed.success) return Response.json({ error: bodyParsed.error.flatten() }, { status: 400 })

  const { id } = paramsParsed.data
  const { categoryId, notes } = bodyParsed.data

  const rows = await sql`
    UPDATE transactions SET
      category_id = CASE WHEN ${categoryId !== undefined} THEN ${categoryId ?? null}::uuid ELSE category_id END,
      notes       = CASE WHEN ${notes !== undefined} THEN ${notes ?? null} ELSE notes END
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id, category_id, notes
  `
  if (!rows[0]) return Response.json({ error: 'Failed to update transaction' }, { status: 500 })
  return Response.json(rows[0])
}
