import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const { id } = parsed.data

  // Only user-owned categories can be deleted (RLS also enforces this)
  const { data: cat } = await supabase
    .from('categories')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cat) return Response.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return Response.json({ error: 'Failed to delete' }, { status: 500 })

  return new Response(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const { id } = parsed.data
  const body = await req.json() as { nameHe?: string; icon?: string; color?: string }

  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cat) return Response.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, string> = {}
  if (body.nameHe) updates.name_he = body.nameHe
  if (body.icon !== undefined) updates.icon = body.icon
  if (body.color !== undefined) updates.color = body.color

  const { error } = await supabase.from('categories').update(updates).eq('id', id)
  if (error) return Response.json({ error: 'Failed to update' }, { status: 500 })

  return Response.json({ ok: true })
}
