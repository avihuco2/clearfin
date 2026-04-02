import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const { id } = parsed.data

  // Ownership check — do not rely on RLS alone
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
  if (error) return Response.json({ error: 'Failed to delete account' }, { status: 500 })

  return new Response(null, { status: 204 })
}
