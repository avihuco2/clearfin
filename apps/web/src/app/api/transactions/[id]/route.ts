import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ParamsSchema = z.object({ id: z.string().uuid() })

const UpdateSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsParsed = ParamsSchema.safeParse(await params)
  if (!paramsParsed.success) return Response.json({ error: 'Invalid transaction id' }, { status: 400 })

  const body = await req.json()
  const bodyParsed = UpdateSchema.safeParse(body)
  if (!bodyParsed.success) return Response.json({ error: bodyParsed.error.flatten() }, { status: 400 })

  const { id } = paramsParsed.data
  const updates: Record<string, unknown> = {}
  if (bodyParsed.data.categoryId !== undefined) updates.category_id = bodyParsed.data.categoryId
  if (bodyParsed.data.notes !== undefined) updates.notes = bodyParsed.data.notes

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, category_id, notes')
    .single()

  if (error || !data) return Response.json({ error: 'Failed to update transaction' }, { status: 500 })
  return Response.json(data)
}
