import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const { id } = parsed.data

  const rows = await sql`SELECT id FROM categories WHERE id = ${id} AND user_id = ${user.id}`
  if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 })

  await sql`DELETE FROM categories WHERE id = ${id} AND user_id = ${user.id}`
  return new Response(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const { id } = parsed.data
  const body = await req.json() as { nameHe?: string; icon?: string; color?: string }

  const rows = await sql`SELECT id FROM categories WHERE id = ${id} AND user_id = ${user.id}`
  if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 })

  await sql`
    UPDATE categories SET
      name_he = COALESCE(${body.nameHe ?? null}, name_he),
      icon    = CASE WHEN ${body.icon !== undefined} THEN ${body.icon ?? null} ELSE icon END,
      color   = CASE WHEN ${body.color !== undefined} THEN ${body.color ?? null} ELSE color END
    WHERE id = ${id} AND user_id = ${user.id}
  `
  return Response.json({ ok: true })
}
