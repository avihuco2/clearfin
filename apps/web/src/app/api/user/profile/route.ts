import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const Schema = z.object({ name: z.string().min(1).max(80) })

export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  await sql`
    UPDATE users SET name = ${parsed.data.name} WHERE id = ${user.id}
  `

  return Response.json({ ok: true })
}
