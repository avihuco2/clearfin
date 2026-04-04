import { NextRequest } from 'next/server'
import { z } from 'zod'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { createServerClient } from '@/lib/supabase/server'

const TriggerSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  since: z.string().date().optional(),
  transactionId: z.string().uuid().optional(),
})

const BATCH_SIZE = 50
const MODEL = google('gemini-2.5-flash-lite')

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = TriggerSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId, since, transactionId } = parsed.data

  // Fetch all available categories (system + user's own)
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name_he')
    .or(`user_id.is.null,user_id.eq.${user.id}`)

  // Mutable map — grows as new categories are created during this run
  const categoryMap = new Map<string, string>(
    (categoriesData ?? []).map((c) => [c.name_he, c.id]),
  )

  // ── Single-transaction mode ──────────────────────────────────────────────
  if (transactionId) {
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('id, description, memo')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .single()

    if (txError || !tx) {
      console.error('[categorize] tx fetch error:', txError)
      return Response.json({ error: 'עסקה לא נמצאה' }, { status: 404 })
    }

    const description = `${tx.description}${tx.memo ? ` (${tx.memo})` : ''}`
    const prompt =
      `קטגוריות קיימות: ${Array.from(categoryMap.keys()).join(', ')}\n\n` +
      `סווג את העסקה הבאה לקטגוריה המתאימה. אם אף קטגוריה קיימת לא מתאימה, המצא שם קטגוריה חדש בעברית (קצר, 1-3 מילים).\n` +
      `החזר JSON בלבד בפורמט: {"category":"שם קטגוריה"}\n\n` +
      `עסקה: ${description}`

    let categoryName: string | null = null
    try {
      const { text } = await generateText({ model: MODEL, prompt })
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as { category?: string }
        categoryName = result.category ?? null
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[categorize] AI error:', msg)
      return Response.json({ error: `AI error: ${msg}` }, { status: 500 })
    }

    if (!categoryName) {
      return Response.json({ error: 'לא הוחזרה קטגוריה' }, { status: 500 })
    }

    // Create new category if needed
    let categoryId = categoryMap.get(categoryName)
    if (!categoryId) {
      const { data: created } = await supabase
        .from('categories')
        .insert({ user_id: user.id, name_he: categoryName })
        .select('id, name_he')
        .single()
      if (created) {
        categoryMap.set(created.name_he, created.id)
        categoryId = created.id
      }
    }

    if (!categoryId) {
      return Response.json({ error: 'שגיאה ביצירת קטגוריה' }, { status: 500 })
    }

    await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .eq('id', transactionId)
      .eq('user_id', user.id)

    return Response.json({ categorized: 1, categoryId })
  }

  // ── Batch mode ───────────────────────────────────────────────────────────
  let query = supabase
    .from('transactions')
    .select('id, description, memo')
    .is('category_id', null)
    .eq('user_id', user.id)
    .limit(200)

  if (bankAccountId) query = query.eq('bank_account_id', bankAccountId)
  if (since) query = query.gte('date', since)

  const { data: transactions, error: txError } = await query
  if (txError) return Response.json({ error: 'שגיאה בטעינת עסקאות' }, { status: 500 })
  if (!transactions?.length) return Response.json({ categorized: 0, newCategories: 0 })

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
      const { text } = await generateText({ model: MODEL, prompt })
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0]) as Record<string, string>
    } catch (err) {
      console.error('[categorize] batch AI error:', err)
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
