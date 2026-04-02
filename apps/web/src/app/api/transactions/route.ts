import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ListSchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = ListSchema.safeParse(sp)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { accountId, categoryId, from, to, limit, offset } = parsed.data

  let query = supabase
    .from('transactions')
    .select('id, date, description, charged_amount, charged_currency, type, status, category_id, notes, bank_account_id')
    .eq('user_id', user.id)  // defence in depth — explicit ownership filter beyond RLS
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (accountId) query = query.eq('bank_account_id', accountId)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query
  if (error) return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  return Response.json(data)
}
