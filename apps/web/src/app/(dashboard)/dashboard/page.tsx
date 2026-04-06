import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { sql } from '@clearfin/db/client'
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
  category_id: string
  name_he: string
  color: string
  charged_amount: number
}

interface DailyRow {
  date: string
  charged_amount: number
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

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
    categorySpendRows,
    dailySpendRows,
    topTxRows,
    uncatRes,
    totalRes,
    txCountRes,
  ] = await Promise.all([
    // 1. Total spend by category (current month, debits only)
    sql<CategoryRow[]>`
      SELECT t.category_id, c.name_he, c.color, t.charged_amount
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ${userId}
        AND t.date >= ${monthStart}::date
        AND t.date <= ${today}::date
        AND t.charged_amount < 0
        AND t.category_id IS NOT NULL
    `,

    // 2. Daily totals for last 30 days
    sql<DailyRow[]>`
      SELECT date::text, charged_amount
      FROM transactions
      WHERE user_id = ${userId}
        AND date >= ${thirtyDaysAgo}::date
        AND date <= ${today}::date
        AND charged_amount < 0
      ORDER BY date ASC
    `,

    // 3. Top 5 transactions by absolute amount this month
    sql<TopTransaction[]>`
      SELECT id, description, charged_amount, date::text
      FROM transactions
      WHERE user_id = ${userId}
        AND date >= ${monthStart}::date
        AND date <= ${today}::date
        AND charged_amount < 0
      ORDER BY charged_amount ASC
      LIMIT 5
    `,

    // 4. Uncategorized count
    sql`
      SELECT COUNT(*) FROM transactions
      WHERE user_id = ${userId} AND category_id IS NULL
    `,

    // 5. Total spend sum this month
    sql<{ charged_amount: number }[]>`
      SELECT charged_amount FROM transactions
      WHERE user_id = ${userId}
        AND date >= ${monthStart}::date
        AND date <= ${today}::date
        AND charged_amount < 0
    `,

    // 6. Transaction count this month
    sql`
      SELECT COUNT(*) FROM transactions
      WHERE user_id = ${userId}
        AND date >= ${monthStart}::date
        AND date <= ${today}::date
    `,
  ])

  // --- Aggregate category spend ---
  const categoryTotals = new Map<
    string,
    { name_he: string; color: string; total: number }
  >()

  for (const row of categorySpendRows) {
    const existing = categoryTotals.get(row.category_id)
    const abs = Math.abs(row.charged_amount)
    if (existing) {
      existing.total += abs
    } else {
      categoryTotals.set(row.category_id, {
        name_he: row.name_he,
        color: row.color,
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
  for (const row of dailySpendRows) {
    const key = (row.date as string).slice(0, 10)
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Math.abs(row.charged_amount))
  }
  const dailyData: DailySpend[] = Array.from(dailyMap.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // --- Summary figures ---
  const totalSpend = totalRes.reduce(
    (sum, r) => sum + Math.abs(r.charged_amount),
    0,
  )
  const transactionCount = Number(txCountRes[0]?.count ?? 0)
  const uncategorizedCount = Number(uncatRes[0]?.count ?? 0)

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
      {topTxRows.length > 0 && (
        <section
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm"
          aria-label="עסקאות גדולות"
        >
          <h2 className="border-b border-[var(--color-border)] px-5 py-4 text-base font-semibold text-[var(--color-foreground)]">
            5 עסקאות גדולות החודש
          </h2>
          <ul className="divide-y divide-[var(--color-border)]">
            {topTxRows.map((tx) => (
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
