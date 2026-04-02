import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Suspense } from 'react'
import { formatCurrency, formatDate } from '@/lib/format'
import { TransactionFilters } from '@/components/transaction-filters'
import { CategorySelect } from '@/components/category-select'
import { CategorizeButton } from '@/components/categorize-button'
import type { CategoryOption } from '@/components/category-select'

const PAGE_SIZE = 50

interface SearchParams {
  accountId?: string
  categoryId?: string
  from?: string
  to?: string
  offset?: string
}

interface Transaction {
  id: string
  date: string
  description: string
  charged_amount: number
  charged_currency: string | null
  category_id: string | null
  bank_account_id: string
  status: string | null
}

interface BankAccount {
  id: string
  company_id: string
  display_name: string | null
}

interface CategoryRaw {
  id: string
  name_he: string | null
  name: string | null
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const supabase = createServerComponentClient({ cookies })

  const offset = Math.max(0, parseInt(sp.offset ?? '0', 10) || 0)

  // Fetch accounts and categories for filter controls + inline select
  const [accountsResult, categoriesResult, uncatResult] = await Promise.all([
    supabase
      .from('bank_accounts')
      .select('id, company_id, display_name')
      .order('created_at', { ascending: false })
      .returns<BankAccount[]>(),
    supabase
      .from('categories')
      .select('id, name_he, name')
      .order('name_he', { ascending: true })
      .returns<CategoryRaw[]>(),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('category_id', null),
  ])

  // Build transactions query with filters
  let query = supabase
    .from('transactions')
    .select(
      'id, date, description, charged_amount, charged_currency, category_id, bank_account_id, status',
      { count: 'exact' },
    )
    .order('date', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (sp.accountId) query = query.eq('bank_account_id', sp.accountId)
  if (sp.categoryId) query = query.eq('category_id', sp.categoryId)
  if (sp.from) query = query.gte('date', sp.from)
  if (sp.to) query = query.lte('date', sp.to)

  const { data: transactions, count, error } = await query.returns<Transaction[]>()

  const accounts = accountsResult.data ?? []
  const categoriesRaw = categoriesResult.data ?? []
  const uncategorizedCount = uncatResult.count ?? 0

  // Normalise categories — prefer name_he, fall back to name
  const categories: CategoryOption[] = categoriesRaw.map((c) => ({
    id: c.id,
    name_he: c.name_he ?? c.name ?? c.id,
  }))

  // Build lookup maps
  const accountMap = new Map<string, BankAccount>(accounts.map((a) => [a.id, a]))
  const categoryMap = new Map<string, CategoryOption>(categories.map((c) => [c.id, c]))

  // Filter-bar-compatible categories (id + name)
  const filterCategories = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name_he ?? c.name ?? c.id,
  }))

  const totalCount = count ?? 0
  const hasNext = offset + PAGE_SIZE < totalCount
  const hasPrev = offset > 0

  function buildPageUrl(newOffset: number) {
    const params = new URLSearchParams()
    if (sp.accountId) params.set('accountId', sp.accountId)
    if (sp.categoryId) params.set('categoryId', sp.categoryId)
    if (sp.from) params.set('from', sp.from)
    if (sp.to) params.set('to', sp.to)
    params.set('offset', String(newOffset))
    return `/transactions?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">עסקאות</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {totalCount > 0
              ? `${totalCount.toLocaleString('he-IL')} עסקאות`
              : 'לא נמצאו עסקאות'}
          </p>
        </div>
        <CategorizeButton uncategorizedCount={uncategorizedCount} />
      </div>

      {/* Filter controls — client component wrapped in Suspense for streaming */}
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-gray-100" />}>
        <TransactionFilters accounts={accounts} categories={filterCategories} />
      </Suspense>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          שגיאה בטעינת העסקאות. נסה לרענן את הדף.
        </div>
      )}

      {/* Empty state */}
      {!error && transactions?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-20 text-center">
          <p className="mb-2 text-lg font-semibold text-[var(--color-foreground)]">אין עסקאות</p>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            {sp.accountId || sp.categoryId || sp.from || sp.to
              ? 'לא נמצאו עסקאות עבור הסינון הנוכחי'
              : 'אין עסקאות בחשבונות המחוברים עדיין'}
          </p>
          {!sp.accountId && !sp.categoryId && !sp.from && !sp.to && (
            <Link
              href="/accounts"
              className="text-sm font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
            >
              חבר חשבון בנק
            </Link>
          )}
        </div>
      )}

      {/* Transactions table */}
      {transactions && transactions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" aria-label="טבלת עסקאות">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    תאריך
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    תיאור
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    סכום
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    קטגוריה
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    חשבון
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {transactions.map((tx) => {
                  const account = accountMap.get(tx.bank_account_id)
                  const isDebit = tx.charged_amount < 0

                  return (
                    <tr
                      key={tx.id}
                      className="transition-colors hover:bg-[var(--color-muted)]/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-[var(--color-muted-foreground)]">
                        {formatDate(tx.date)}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--color-foreground)]">
                        <span dir="auto">{tx.description}</span>
                      </td>
                      <td
                        className={[
                          'whitespace-nowrap px-4 py-3.5 text-end font-medium tabular-nums',
                          isDebit ? 'text-red-600' : 'text-green-600',
                        ].join(' ')}
                      >
                        {formatCurrency(tx.charged_amount)}
                      </td>
                      <td className="px-4 py-3.5">
                        <CategorySelect
                          transactionId={tx.id}
                          currentCategoryId={tx.category_id}
                          categories={categories}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[var(--color-muted-foreground)]">
                        {account?.display_name ?? account?.company_id ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                מציג {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} מתוך{' '}
                {totalCount.toLocaleString('he-IL')}
              </p>
              <div className="flex gap-2">
                {hasPrev && (
                  <Link
                    href={buildPageUrl(offset - PAGE_SIZE)}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                  >
                    הקודם
                  </Link>
                )}
                {hasNext && (
                  <Link
                    href={buildPageUrl(offset + PAGE_SIZE)}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                  >
                    הבא
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
