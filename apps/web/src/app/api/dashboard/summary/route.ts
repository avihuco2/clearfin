import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    totalsResult,
    byCategoryResult,
    dailyTotalsResult,
    topTransactionsResult,
  ] = await Promise.all([
    // totalSpent, transactionCount, uncategorizedCount — all scoped to current calendar month
    supabase
      .from('transactions')
      .select('charged_amount, category_id')
      .eq('user_id', user.id)
      .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),

    // byCategory — JOIN categories, current month
    supabase
      .from('transactions')
      .select('charged_amount, category_id, categories(id, name_he, color, icon)')
      .eq('user_id', user.id)
      .not('category_id', 'is', null)
      .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),

    // dailyTotals — last 30 days
    supabase
      .from('transactions')
      .select('date, charged_amount')
      .eq('user_id', user.id)
      .gte(
        'date',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      )
      .order('date', { ascending: true }),

    // topTransactions — top 5 by absolute charged_amount this month
    supabase
      .from('transactions')
      .select('id, description, charged_amount, date, categories(name_he)')
      .eq('user_id', user.id)
      .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
      .order('charged_amount', { ascending: true })
      .limit(5),
  ])

  if (totalsResult.error) return Response.json({ error: 'Failed to fetch summary' }, { status: 500 })
  if (byCategoryResult.error) return Response.json({ error: 'Failed to fetch category summary' }, { status: 500 })
  if (dailyTotalsResult.error) return Response.json({ error: 'Failed to fetch daily totals' }, { status: 500 })
  if (topTransactionsResult.error) return Response.json({ error: 'Failed to fetch top transactions' }, { status: 500 })

  // ── totals ──────────────────────────────────────────────────────────────────
  const rows = totalsResult.data ?? []
  const totalSpent = rows
    .filter((r) => r.charged_amount < 0)
    .reduce((sum, r) => sum + r.charged_amount, 0)
  const transactionCount = rows.length
  const uncategorizedCount = rows.filter((r) => r.category_id === null).length

  // ── byCategory ──────────────────────────────────────────────────────────────
  const categoryMap = new Map<
    string,
    { categoryId: string; nameHe: string; color: string; icon: string; total: number }
  >()
  for (const row of byCategoryResult.data ?? []) {
    const cat = (row.categories as unknown) as { id: string; name_he: string; color: string; icon: string } | null
    if (!cat || !row.category_id) continue
    const existing = categoryMap.get(row.category_id)
    if (existing) {
      existing.total += row.charged_amount
    } else {
      categoryMap.set(row.category_id, {
        categoryId: row.category_id,
        nameHe: cat.name_he,
        color: cat.color,
        icon: cat.icon,
        total: row.charged_amount,
      })
    }
  }
  const byCategory = Array.from(categoryMap.values())

  // ── dailyTotals ─────────────────────────────────────────────────────────────
  const dailyMap = new Map<string, number>()
  for (const row of dailyTotalsResult.data ?? []) {
    const day = row.date.slice(0, 10)
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + row.charged_amount)
  }
  const dailyTotals = Array.from(dailyMap.entries()).map(([date, total]) => ({ date, total }))

  // ── topTransactions ──────────────────────────────────────────────────────────
  const topTransactions = (topTransactionsResult.data ?? []).map((row) => {
    const cat = (row.categories as unknown) as { name_he: string } | null
    return {
      id: row.id,
      description: row.description,
      chargedAmount: row.charged_amount,
      date: row.date.slice(0, 10),
      categoryNameHe: cat?.name_he ?? null,
    }
  })

  return Response.json({
    totalSpent,
    transactionCount,
    uncategorizedCount,
    byCategory,
    dailyTotals,
    topTransactions,
  })
}
