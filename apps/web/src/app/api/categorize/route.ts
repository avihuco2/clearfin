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
    .select('id, description, memo')
    .is('category_id', null)
    .eq('user_id', user.id)
    .limit(200)

  if (bankAccountId) query = query.eq('bank_account_id', bankAccountId)
  if (since) query = query.gte('date', since)

  const { data: transactions, error: txError } = await query
  if (txError) return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  if (!transactions?.length) return Response.json({ categorized: 0, newCategories: 0 })

  // Fetch all available categories (system + user's own)
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name_he')
    .or(`user_id.is.null,user_id.eq.${user.id}`)

  // Mutable map — grows as new categories are created during this run
  const categoryMap = new Map<string, string>(
    (categoriesData ?? []).map((c) => [c.name_he, c.id]),
  )

  let totalCategorized = 0
  let totalNewCategories = 0

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE)
    const descriptions = batch
      .map((t, idx) => `${idx}: ${t.description}${t.memo ? ` (${t.memo})` : ''}`)
      .join('\n')

    const prompt =
      `קטגוריות קיימות: ${Array.from(categoryMap.keys()).join(', ')}\n\n` +
      `סווג כל עסקה לקטגוריה המתאימה. אם אף קטגוריה קיימת לא מתאימה, המצא שם קטגוריה חדש בעברית (קצר, 1-3 מילים).\n` +
      `החזר JSON בלבד בפורמט: {"0":"שם קטגוריה","1":"שם קטגוריה",...}\n\n` +
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
      continue
    }

    // Create any new categories the AI suggested
    for (const categoryName of Object.values(result)) {
      if (!categoryName || categoryMap.has(categoryName)) continue

      const { data: created } = await supabase
        .from('categories')
        .insert({ user_id: user.id, name_he: categoryName })
        .select('id, name_he')
        .single()

      if (created) {
        categoryMap.set(created.name_he, created.id)
        totalNewCategories++
      }
    }

    // Apply categorizations
    const updates = batch
      .map((t, idx) => {
        const categoryName = result[String(idx)]
        const categoryId = categoryName ? categoryMap.get(categoryName) : undefined
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

  return Response.json({ categorized: totalCategorized, newCategories: totalNewCategories })
}
