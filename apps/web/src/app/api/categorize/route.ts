import { NextRequest } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TriggerSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  since: z.string().date().optional(),
})

const BATCH_SIZE = 50

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = TriggerSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId, since } = parsed.data

  // Fetch uncategorized transactions
  let query = supabase
    .from('transactions')
    .select('id, description')
    .is('category_id', null)
    .eq('user_id', user.id)
    .limit(200)

  if (bankAccountId) query = query.eq('bank_account_id', bankAccountId)
  if (since) query = query.gte('date', since)

  const { data: transactions, error: txError } = await query
  if (txError) return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  if (!transactions?.length) return Response.json({ categorized: 0 })

  // Fetch available category ids + Hebrew names for the prompt
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name_he')
    .or(`user_id.is.null,user_id.eq.${user.id}`)

  const categoryMap = Object.fromEntries((categories ?? []).map(c => [c.name_he, c.id]))
  const categoryList = Object.keys(categoryMap).join(', ')

  let totalCategorized = 0

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE)
    const descriptions = batch.map((t, idx) => `${idx}: ${t.description}`).join('\n')

    const prompt =
      `קטגוריות זמינות: ${categoryList}\n\n` +
      `סווג כל עסקה לקטגוריה המתאימה ביותר. החזר JSON בפורמט: {"0":"קטגוריה","1":"קטגוריה",...}\n\n` +
      `עסקאות:\n${descriptions}`

    let result: Record<string, string> = {}
    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0]) as Record<string, string>
    } catch {
      // Skip batch on model error; don't surface details to client
      continue
    }

    // Upsert categories
    const updates = batch
      .map((t, idx) => {
        const categoryName = result[String(idx)]
        const categoryId = categoryName ? categoryMap[categoryName] : undefined
        return categoryId ? { id: t.id, category_id: categoryId } : null
      })
      .filter(Boolean) as Array<{ id: string; category_id: string }>

    for (const update of updates) {
      await supabase
        .from('transactions')
        .update({ category_id: update.category_id })
        .eq('id', update.id)
        .eq('user_id', user.id)
    }

    totalCategorized += updates.length
  }

  return Response.json({ categorized: totalCategorized })
}
