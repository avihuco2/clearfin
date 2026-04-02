import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { SummaryCards } from '@/components/charts/summary-cards'
import { SpendingByCategory } from '@/components/charts/spending-by-category'
import { SpendingOverTime } from '@/components/charts/spending-over-time'
import { CategorizeButton } from '@/components/categorize-button'
import { formatCurrency, formatDate } from '@/lib/format'
import type { CategorySpend } from '@/components/charts/spending-by-category'
import type { DailySpend } from '@/components/charts/spending-over-time'

interface TopTransaction {
  id: string
  description: string
  charged_amount: number
  date: string
}

interface CategoryRow {
  category_id: string | null
  charged_amount: number
  categories: { name_he: string; color: string } | null
}

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies })

  // Date range: current calendar month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  // Date 30 days ago for spending-over-time
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const [
    categorySpendResult,
    dailySpendResult,
    topTxResult,
    uncatResult,
    totalResult,
    txCountResult,
  ] = await Promise.all([
    // 1. Total spend by category (current month, debits only)
    supabase
      .from('transactions')
      .select('category_id, charged_amount, categories(name_he, color)')
      .gte('date', monthStart)
      .lte('date', today)
      .lt('charged_amount', 0)
      .returns<CategoryRow[]>(),

    // 2. Daily totals for last 30 days
    supabase
      .from('transactions')
      .select('date, charged_amount')
      .gte('date', thirtyDaysAgo)
      .lte('date', today)
      .lt('charged_amount', 0)
      .order('date', { ascending: true }),

    // 3. Top 5 transactions by absolute amount this month
    supabase
      .from('transactions')
      .select('id, description, charged_amount, date')
      .gte('date', monthStart)
      .lte('date', today)
      .lt('charged_amount', 0)
      .order('charged_amount', { ascending: true })
      .limit(5)
      .returns<TopTransaction[]>(),

    // 4. Uncategorized count
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('category_id', null),

    // 5. Total spend sum this month
    supabase
      .from('transactions')
      .select('charged_amount')
      .gte('date', monthStart)
      .lte('date', today)
      .lt('charged_amount', 0)
      .returns<{ charged_amount: number }[]>(),

    // 6. Transaction count this month
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .gte('date', monthStart)
      .lte('date', today),
  ])

  // --- Aggregate category spend ---
  const categoryTotals = new Map<
    string,
    { name_he: string; color: string; total: number }
  >()

  for (const row of categorySpendResult.data ?? []) {
    if (!row.category_id || !row.categories) continue
    const existing = categoryTotals.get(row.category_id)
    const abs = Math.abs(row.charged_amount)
    if (existing) {
      existing.total += abs
    } else {
      categoryTotals.set(row.category_id, {
        name_he: row.categories.name_he,
        color: row.categories.color,
        total: abs,
      })
    }
  }

  const categoryData: CategorySpend[] = Array.from(categoryTotals.entries())
    .map(([category_id, v]) => ({ category_id, ...v }))
    .sort((a, b) => b.total - a.total)

  const topCategory = categoryData[0]?.name_he ?? null

  // --- Aggregate daily spend ---
  const dailyMap = new Map<string, number>()
  for (const row of dailySpendResult.data ?? []) {
    const key = (row.date as string).slice(0, 10)
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Math.abs(row.charged_amount as number))
  }
  const dailyData: DailySpend[] = Array.from(dailyMap.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // --- Summary figures ---
  const totalSpend = (totalResult.data ?? []).reduce(
    (sum, r) => sum + Math.abs(r.charged_amount),
    0,
  )
  const transactionCount = txCountResult.count ?? 0
  const uncategorizedCount = uncatResult.count ?? 0
  const topTransactions = topTxResult.data ?? []

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">לוח בקרה</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            סיכום פיננסי לחודש הנוכחי
          </p>
        </div>
        <CategorizeButton uncategorizedCount={uncategorizedCount} />
      </div>

      {/* Summary stat cards */}
      <SummaryCards
        totalSpend={totalSpend}
        transactionCount={transactionCount}
        topCategory={topCategory}
        uncategorizedCount={uncategorizedCount}
      />

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category donut */}
        <section
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm"
          aria-label="הוצאות לפי קטגוריה"
        >
          <h2 className="mb-4 text-base font-semibold text-[var(--color-foreground)]">
            הוצאות לפי קטגוריה
          </h2>
          <SpendingByCategory data={categoryData} />
        </section>

        {/* Spending over time */}
        <section
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm"
          aria-label="הוצאות לאורך זמן"
        >
          <h2 className="mb-4 text-base font-semibold text-[var(--color-foreground)]">
            הוצאות — 30 ימים אחרונים
          </h2>
          <SpendingOverTime data={dailyData} />
        </section>
      </div>

      {/* Top transactions */}
      {topTransactions.length > 0 && (
        <section
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm"
          aria-label="עסקאות גדולות"
        >
          <h2 className="border-b border-[var(--color-border)] px-5 py-4 text-base font-semibold text-[var(--color-foreground)]">
            5 עסקאות גדולות החודש
          </h2>
          <ul className="divide-y divide-[var(--color-border)]">
            {topTransactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium text-[var(--color-foreground)]"
                    dir="auto"
                  >
                    {tx.description}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(tx.date)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-red-600">
                  {formatCurrency(tx.charged_amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
