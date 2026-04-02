import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const CreateCategorySchema = z.object({
  nameHe: z.string().min(1).max(60),
  nameEn: z.string().min(1).max(60).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  parentId: z.string().uuid().nullable().optional(),
})

export async function GET() {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Return system categories (user_id IS NULL) + user's own categories
  const { data, error } = await supabase
    .from('categories')
    .select('id, name_he, name_en, icon, color, parent_id, user_id')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order('name_he')

  if (error) return Response.json({ error: 'Failed to fetch categories' }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateCategorySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { nameHe, nameEn, icon, color, parentId } = parsed.data

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name_he: nameHe,
      name_en: nameEn,
      icon,
      color,
      parent_id: parentId,
    })
    .select('id, name_he, name_en, icon, color, parent_id')
    .single()

  if (error) return Response.json({ error: 'Failed to create category' }, { status: 500 })
  return Response.json(data, { status: 201 })
}
