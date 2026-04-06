import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const ListSchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = ListSchema.safeParse(sp)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { accountId, categoryId, from, to, limit, offset } = parsed.data

  const data = await sql`
    SELECT id, date, description, charged_amount, charged_currency, type, status,
           category_id, notes, bank_account_id
    FROM transactions
    WHERE user_id = ${user.id}
      AND (${accountId ?? null}::uuid IS NULL OR bank_account_id = ${accountId ?? null}::uuid)
      AND (${categoryId ?? null}::uuid IS NULL OR category_id = ${categoryId ?? null}::uuid)
      AND (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
      AND (${to ?? null}::date IS NULL OR date <= ${to ?? null}::date)
    ORDER BY date DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  return Response.json(data)
}
