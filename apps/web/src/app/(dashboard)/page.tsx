import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatCurrency } from '@/lib/format'
import { ScrapeAllButton } from '@/components/scrape-all-button'

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const displayName =
    session?.user.user_metadata?.['full_name'] ??
    session?.user.email ??
    'משתמש'

  // Fetch summary data in parallel
  const [accountsResult, transactionsResult, pendingResult] = await Promise.all([
    supabase.from('bank_accounts').select('id', { count: 'exact', head: true }),
    supabase
      .from('transactions')
      .select('charged_amount', { count: 'exact' })
      .order('date', { ascending: false })
      .limit(200),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('category_id', null),
  ])

  const accountCount = accountsResult.count ?? 0
  const transactionCount = transactionsResult.count ?? 0
  const pendingCount = pendingResult.count ?? 0

  // Sum all transaction amounts for balance display
  const totalBalance =
    transactionsResult.data?.reduce(
      (sum, t) => sum + (t.charged_amount ?? 0),
      0,
    ) ?? 0

  const hasAccounts = accountCount > 0

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            שלום, {displayName}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            ברוך הבא לניהול הפיננסי שלך
          </p>
        </div>
        <ScrapeAllButton />
      </div>

      {hasAccounts ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              title="כמות עסקאות"
              value={transactionCount.toLocaleString('he-IL')}
              description="עסקאות מוכרות"
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              }
            />
            <StatCard
              title="יתרה כוללת"
              value={formatCurrency(totalBalance)}
              description="סך כל העסקאות"
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                  <path d="M12 6v2m0 8v2" />
                </svg>
              }
            />
            <StatCard
              title="ממתינות לסיווג"
              value={pendingCount.toLocaleString('he-IL')}
              description="עסקאות ללא קטגוריה"
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 8v4l3 3" />
                </svg>
              }
              highlight={pendingCount > 0}
            />
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <QuickLink href="/transactions" label="צפה בכל העסקאות" />
            <QuickLink href="/accounts" label="ניהול חשבונות" />
          </div>
        </>
      ) : (
        /* Empty state — no accounts yet */
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-20 text-center">
          <div className="mb-4 rounded-full bg-[var(--color-accent)] p-4 text-[var(--color-primary)]">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-foreground)]">
            לא חוברו חשבונות עדיין
          </h2>
          <p className="mb-6 max-w-xs text-sm text-[var(--color-muted-foreground)]">
            חבר את חשבון הבנק שלך כדי להתחיל לעקוב אחרי העסקאות שלך
          </p>
          <Link
            href="/accounts/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            חבר חשבון בנק
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  description,
  icon,
  highlight = false,
}: {
  title: string
  value: string
  description: string
  icon: ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={[
        'rounded-xl border p-5 shadow-sm',
        highlight
          ? 'border-amber-200 bg-amber-50'
          : 'border-[var(--color-border)] bg-[var(--color-card)]',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-muted-foreground)]">{title}</span>
        <span className={highlight ? 'text-amber-600' : 'text-[var(--color-primary)]'}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-[var(--color-foreground)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{description}</p>
    </div>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 shadow-sm transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-accent)]"
    >
      <span className="text-sm font-medium text-[var(--color-foreground)]">{label}</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--color-muted-foreground)] rotate-180"
        aria-hidden="true"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
