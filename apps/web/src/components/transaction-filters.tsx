'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'

interface Account {
  id: string
  display_name: string | null
  company_id: string
}

interface Category {
  id: string
  name: string
}

interface TransactionFiltersProps {
  accounts: Account[]
  categories: Category[]
}

export function TransactionFilters({ accounts, categories }: TransactionFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const [from, setFrom] = useState(searchParams.get('from') ?? '')
  const [to, setTo] = useState(searchParams.get('to') ?? '')

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    if (categoryId) params.set('categoryId', categoryId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('offset', '0')
    router.push(`${pathname}?${params.toString()}`)
  }, [accountId, categoryId, from, to, pathname, router])

  function clearFilters() {
    setAccountId('')
    setCategoryId('')
    setFrom('')
    setTo('')
    router.push(pathname)
  }

  const hasActiveFilters = accountId || categoryId || from || to

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Account filter */}
        <div className="space-y-1">
          <label
            htmlFor="filter-account"
            className="block text-xs font-medium text-[var(--color-muted-foreground)]"
          >
            חשבון
          </label>
          <select
            id="filter-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          >
            <option value="">כל החשבונות</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name ?? a.company_id}
              </option>
            ))}
          </select>
        </div>

        {/* Category filter */}
        <div className="space-y-1">
          <label
            htmlFor="filter-category"
            className="block text-xs font-medium text-[var(--color-muted-foreground)]"
          >
            קטגוריה
          </label>
          <select
            id="filter-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          >
            <option value="">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="space-y-1">
          <label
            htmlFor="filter-from"
            className="block text-xs font-medium text-[var(--color-muted-foreground)]"
          >
            מתאריך
          </label>
          <input
            id="filter-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        {/* Date to */}
        <div className="space-y-1">
          <label
            htmlFor="filter-to"
            className="block text-xs font-medium text-[var(--color-muted-foreground)]"
          >
            עד תאריך
          </label>
          <input
            id="filter-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-[var(--color-muted-foreground)] underline-offset-2 hover:underline"
          >
            נקה סינון
          </button>
        )}
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          סנן
        </button>
      </div>
    </div>
  )
}
