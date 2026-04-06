import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

export const runtime = 'nodejs'

export async function GET() {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const [totalsRows, byCategoryRows, dailyRows, topRows] = await Promise.all([
    sql`
      SELECT charged_amount, category_id
      FROM transactions
      WHERE user_id = ${user.id} AND date >= ${monthStart}
    `,
    sql`
      SELECT t.charged_amount, t.category_id,
             c.id AS cat_id, c.name_he, c.color, c.icon
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ${user.id}
        AND t.category_id IS NOT NULL
        AND t.date >= ${monthStart}
    `,
    sql`
      SELECT date, charged_amount
      FROM transactions
      WHERE user_id = ${user.id} AND date >= ${thirtyDaysAgo}
      ORDER BY date ASC
    `,
    sql`
      SELECT t.id, t.description, t.charged_amount, t.date, c.name_he AS category_name_he
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ${user.id} AND t.date >= ${monthStart}
      ORDER BY t.charged_amount ASC
      LIMIT 5
    `,
  ])

  // totals
  const totalSpent = totalsRows
    .filter((r) => Number(r.charged_amount) < 0)
    .reduce((sum, r) => sum + Number(r.charged_amount), 0)
  const transactionCount = totalsRows.length
  const uncategorizedCount = totalsRows.filter((r) => r.category_id === null).length

  // byCategory
  const categoryMap = new Map<string, { categoryId: string; nameHe: string; color: string; icon: string; total: number }>()
  for (const row of byCategoryRows) {
    if (!row.category_id) continue
    const existing = categoryMap.get(row.category_id as string)
    if (existing) {
      existing.total += Number(row.charged_amount)
    } else {
      categoryMap.set(row.category_id as string, {
        categoryId: row.category_id as string,
        nameHe: row.name_he as string,
        color: row.color as string,
        icon: row.icon as string,
        total: Number(row.charged_amount),
      })
    }
  }
  const byCategory = Array.from(categoryMap.values())

  // dailyTotals
  const dailyMap = new Map<string, number>()
  for (const row of dailyRows) {
    const day = String(row.date).slice(0, 10)
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(row.charged_amount))
  }
  const dailyTotals = Array.from(dailyMap.entries()).map(([date, total]) => ({ date, total }))

  // topTransactions
  const topTransactions = topRows.map((row) => ({
    id: row.id,
    description: row.description,
    chargedAmount: Number(row.charged_amount),
    date: String(row.date).slice(0, 10),
    categoryNameHe: row.category_name_he ?? null,
  }))

  return Response.json({ totalSpent, transactionCount, uncategorizedCount, byCategory, dailyTotals, topTransactions })
}
