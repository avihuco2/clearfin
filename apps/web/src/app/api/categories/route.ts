import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const CreateCategorySchema = z.object({
  nameHe: z.string().min(1).max(60),
  nameEn: z.string().min(1).max(60).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  parentId: z.string().uuid().nullable().optional(),
})

export async function GET() {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await sql`
    SELECT id, name_he, name_en, icon, color, parent_id, user_id
    FROM categories
    WHERE user_id IS NULL OR user_id = ${user.id}
    ORDER BY name_he
  `
  return Response.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateCategorySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { nameHe, nameEn, icon, color, parentId } = parsed.data

  const rows = await sql`
    INSERT INTO categories (user_id, name_he, name_en, icon, color, parent_id)
    VALUES (${user.id}, ${nameHe}, ${nameEn ?? null}, ${icon ?? null}, ${color ?? null}, ${parentId ?? null})
    RETURNING id, name_he, name_en, icon, color, parent_id
  `
  return Response.json(rows[0], { status: 201 })
}
