import { NextRequest } from 'next/server'
import { z } from 'zod'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

const TriggerSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  since: z.string().date().optional(),
  transactionId: z.string().uuid().optional(),
})

const BATCH_SIZE = 50
const MODEL = google('gemini-2.5-flash-lite')

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = TriggerSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId, since, transactionId } = parsed.data

  const categoriesData = await sql`
    SELECT id, name_he, icon FROM categories
    WHERE user_id IS NULL OR user_id = ${user.id}
  `

  const categoryMap = new Map<string, string>(categoriesData.map((c) => [c.name_he as string, c.id as string]))
  const iconMap = new Map<string, string>(
    categoriesData.filter((c) => c.icon).map((c) => [c.name_he as string, c.icon as string]),
  )

  // ── Single-transaction mode ──────────────────────────────────────────────
  if (transactionId) {
    const txRows = await sql`
      SELECT id, description, memo FROM transactions
      WHERE id = ${transactionId} AND user_id = ${user.id}
    `
    const tx = txRows[0]
    if (!tx) return Response.json({ error: 'עסקה לא נמצאה' }, { status: 404 })

    const description = `${tx.description}${tx.memo ? ` (${tx.memo})` : ''}`
    const prompt =
      `קטגוריות קיימות: ${Array.from(categoryMap.keys()).join(', ')}\n\n` +
      `סווג את העסקה הבאה לקטגוריה המתאימה. אם אף קטגוריה קיימת לא מתאימה, המצא שם קטגוריה חדש בעברית (קצר, 1-3 מילים).\n` +
      `החזר JSON בלבד בפורמט: {"category":"שם קטגוריה","icon":"🔤"}\n` +
      `ה-icon יהיה אמוג'י אחד המתאים לקטגוריה.\n\n` +
      `עסקה: ${description}`

    let categoryName: string | null = null
    let categoryIcon: string | null = null
    try {
      const { text } = await generateText({ model: MODEL, prompt })
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as { category?: string; icon?: string }
        categoryName = result.category ?? null
        categoryIcon = result.icon ?? null
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: `AI error: ${msg}` }, { status: 500 })
    }

    if (!categoryName) return Response.json({ error: 'לא הוחזרה קטגוריה' }, { status: 500 })

    let categoryId = categoryMap.get(categoryName)
    const isNew = !categoryId
    if (isNew) {
      const created = await sql`
        INSERT INTO categories (user_id, name_he, icon)
        VALUES (${user.id}, ${categoryName}, ${categoryIcon ?? null})
        RETURNING id, name_he, icon
      `
      if (created[0]) {
        categoryMap.set(created[0].name_he as string, created[0].id as string)
        if (created[0].icon) iconMap.set(created[0].name_he as string, created[0].icon as string)
        categoryId = created[0].id as string
        categoryIcon = created[0].icon as string ?? categoryIcon
      }
    } else if (categoryIcon && !iconMap.has(categoryName)) {
      await sql`UPDATE categories SET icon = ${categoryIcon} WHERE id = ${categoryId} AND user_id = ${user.id}`
      iconMap.set(categoryName, categoryIcon)
    } else {
      categoryIcon = iconMap.get(categoryName) ?? null
    }

    if (!categoryId) return Response.json({ error: 'שגיאה ביצירת קטגוריה' }, { status: 500 })

    await sql`UPDATE transactions SET category_id = ${categoryId} WHERE id = ${transactionId} AND user_id = ${user.id}`

    return Response.json({ categorized: 1, categoryId, categoryName, categoryIcon, isNew })
  }

  // ── Batch mode ───────────────────────────────────────────────────────────
  const transactions = await sql`
    SELECT id, description, memo FROM transactions
    WHERE category_id IS NULL
      AND user_id = ${user.id}
      AND (${bankAccountId ?? null}::uuid IS NULL OR bank_account_id = ${bankAccountId ?? null}::uuid)
      AND (${since ?? null}::date IS NULL OR date >= ${since ?? null}::date)
    LIMIT 200
  `

  if (!transactions.length) return Response.json({ categorized: 0, newCategories: 0 })

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
      `החזר JSON בלבד בפורמט: {"0":{"name":"שם קטגוריה","icon":"🔤"},"1":{"name":"שם קטגוריה","icon":"🔤"},...}\n` +
      `ה-icon יהיה אמוג'י אחד המתאים לקטגוריה.\n\n` +
      `עסקאות:\n${descriptions}`

    let result: Record<string, { name: string; icon: string }> = {}
    try {
      const { text } = await generateText({ model: MODEL, prompt })
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0]) as Record<string, { name: string; icon: string }>
    } catch {
      continue
    }

    for (const { name: catName, icon: catIcon } of Object.values(result)) {
      if (!catName) continue
      if (categoryMap.has(catName)) {
        if (catIcon && !iconMap.has(catName)) {
          const id = categoryMap.get(catName)!
          await sql`UPDATE categories SET icon = ${catIcon} WHERE id = ${id} AND user_id = ${user.id}`
          iconMap.set(catName, catIcon)
        }
        continue
      }
      const created = await sql`
        INSERT INTO categories (user_id, name_he, icon)
        VALUES (${user.id}, ${catName}, ${catIcon ?? null})
        RETURNING id, name_he, icon
      `
      if (created[0]) {
        categoryMap.set(created[0].name_he as string, created[0].id as string)
        if (created[0].icon) iconMap.set(created[0].name_he as string, created[0].icon as string)
        totalNewCategories++
      }
    }

    for (let idx = 0; idx < batch.length; idx++) {
      const entry = result[String(idx)]
      const catId = entry?.name ? categoryMap.get(entry.name) : undefined
      if (!catId) continue
      await sql`UPDATE transactions SET category_id = ${catId} WHERE id = ${batch[idx].id} AND user_id = ${user.id}`
      totalCategorized++
    }
  }

  return Response.json({ categorized: totalCategorized, newCategories: totalNewCategories })
}
