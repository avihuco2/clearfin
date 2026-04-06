import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { sql } from '@clearfin/db/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { TransactionFilters } from '@/components/transaction-filters'
import { CategorySelect } from '@/components/category-select'
import { CategorizeButton } from '@/components/categorize-button'
import { RowAiCategorize } from '@/components/row-ai-categorize'
import { CategoriesProvider } from '@/lib/categories-context'
import type { CategoryOption } from '@/lib/categories-context'

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
  sub_account: string | null
}

interface BankAccount {
  id: string
  company_id: string
  display_name: string | null
  account_number: string | null
}

const COMPANY_LABELS: Record<string, string> = {
  hapoalim: 'בנק הפועלים',
  leumi: 'בנק לאומי',
  discount: 'בנק דיסקונט',
  mizrahi: 'בנק מזרחי',
  visaCal: 'ויזה כ.א.ל',
  max: 'מקס',
  isracard: 'ישראכארד',
  amex: 'אמריקן אקספרס',
}

interface CategoryRaw {
  id: string
  name_he: string | null
  name_en: string | null
  icon: string | null
  color: string | null
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const sp = await searchParams
  const userId = session.user.id
  const offset = Math.max(0, parseInt(sp.offset ?? '0', 10) || 0)

  const accountId = sp.accountId ?? null
  const categoryId = sp.categoryId ?? null
  const from = sp.from ?? null
  const to = sp.to ?? null

  const [accounts, categoriesRaw, uncatRes, txRes] = await Promise.all([
    sql<BankAccount[]>`
      SELECT id, company_id, display_name, account_number
      FROM bank_accounts
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `,
    sql<CategoryRaw[]>`
      SELECT id, name_he, name_en, icon, color
      FROM categories
      WHERE user_id IS NULL OR user_id = ${userId}
      ORDER BY name_he ASC
    `,
    sql`
      SELECT COUNT(*) FROM transactions
      WHERE user_id = ${userId} AND category_id IS NULL
    `,
    sql<Transaction[]>`
      SELECT id, date, description, charged_amount, charged_currency,
             category_id, bank_account_id, status, sub_account
      FROM transactions
      WHERE user_id = ${userId}
        AND (${accountId}::uuid IS NULL OR bank_account_id = ${accountId}::uuid)
        AND (${categoryId}::uuid IS NULL OR category_id = ${categoryId}::uuid)
        AND (${from}::date IS NULL OR date >= ${from}::date)
        AND (${to}::date IS NULL OR date <= ${to}::date)
      ORDER BY date DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    `,
  ])

  const uncategorizedCount = Number(uncatRes[0]?.count ?? 0)

  // Use PAGE_SIZE+1 trick to determine if there's a next page
  const hasNext = txRes.length > PAGE_SIZE
  const transactions = hasNext ? txRes.slice(0, PAGE_SIZE) : txRes
  const hasPrev = offset > 0

  const categories: CategoryOption[] = categoriesRaw.map((c) => ({
    id: c.id,
    name_he: c.name_he ?? c.name_en ?? c.id,
    icon: c.icon,
    color: c.color,
  }))

  const accountMap = new Map<string, BankAccount>(accounts.map((a) => [a.id, a]))

  const filterCategories = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name_he ?? c.name_en ?? c.id,
  }))

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
            {transactions.length > 0
              ? `מציג ${offset + 1}–${offset + transactions.length}`
              : 'לא נמצאו עסקאות'}
          </p>
        </div>
        <CategorizeButton uncategorizedCount={uncategorizedCount} />
      </div>

      <CategoriesProvider initial={categories}>
        {/* Filter controls */}
        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-gray-100" />}>
          <TransactionFilters accounts={accounts} categories={filterCategories} />
        </Suspense>

        {/* Empty state */}
        {transactions.length === 0 && (
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
        {transactions.length > 0 && (
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
                      className="w-56 px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                    >
                      קטגוריה
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                    >
                      מידע נוסף
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
                          <div className="flex items-center gap-1">
                            <CategorySelect
                              transactionId={tx.id}
                              currentCategoryId={tx.category_id}
                            />
                            <RowAiCategorize transactionId={tx.id} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[var(--color-muted-foreground)]">
                          {tx.sub_account ? `****${tx.sub_account.slice(-4)}` : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[var(--color-muted-foreground)]">
                          {account
                            ? (account.display_name ??
                              COMPANY_LABELS[account.company_id] ??
                              account.company_id)
                            : '—'}
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
                  מציג {offset + 1}–{offset + transactions.length}
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
      </CategoriesProvider>
    </div>
  )
}
