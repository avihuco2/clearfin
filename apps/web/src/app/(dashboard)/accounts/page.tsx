import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { sql } from '@clearfin/db/client'
import { formatDate } from '@/lib/format'
import { ScrapeButton } from '@/components/scrape-button'
import { AccountActions } from '@/components/account-actions'

type ScrapeStatus = 'idle' | 'running' | 'done' | 'error' | 'awaiting_otp'

interface BankAccount {
  id: string
  company_id: string
  display_name: string | null
  last_scraped_at: string | null
  scrape_status: ScrapeStatus | null
  balance: number | null
}

const COMPANY_LABELS: Record<string, string> = {
  hapoalim: 'בנק הפועלים',
  leumi: 'בנק לאומי',
  discount: 'בנק דיסקונט',
  mizrahi: 'בנק מזרחי טפחות',
  visaCal: 'ויזה כ.א.ל',
  max: 'מקס (לאומי קארד)',
  isracard: 'ישראכארד',
  amex: 'אמריקן אקספרס',
}

const STATUS_CONFIG: Record<ScrapeStatus, { label: string; bg: string; color: string }> = {
  idle:         { label: 'ממתין',      bg: 'rgba(255,255,255,0.06)', color: 'var(--color-foreground-dim)' },
  running:      { label: 'סורק...',    bg: 'rgba(6,182,212,0.12)',   color: 'var(--color-primary)' },
  done:         { label: 'הושלם',      bg: 'rgba(16,185,129,0.12)',  color: 'var(--color-success)' },
  error:        { label: 'שגיאה',      bg: 'rgba(244,63,94,0.12)',   color: 'var(--color-danger)' },
  awaiting_otp: { label: 'ממתין לקוד', bg: 'rgba(245,158,11,0.12)', color: 'var(--color-gold)' },
}

export default async function AccountsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const accounts = await sql<BankAccount[]>`
    SELECT id, company_id, display_name, last_scraped_at, scrape_status, balance
    FROM bank_accounts
    WHERE user_id = ${session.user.id}
    ORDER BY created_at DESC
  `

  const hasAccounts = accounts.length > 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">חשבונות</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            נהל את חשבונות הבנק המחוברים שלך
          </p>
        </div>
        <Link
          href="/accounts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
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
          הוסף חשבון
        </Link>
      </div>

      {/* Account list */}
      {hasAccounts ? (
        <ul className="space-y-3" role="list" aria-label="רשימת חשבונות">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </ul>
      ) : (
        /* Empty state */
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
            אין חשבונות מחוברים
          </h2>
          <p className="mb-6 max-w-xs text-sm text-[var(--color-muted-foreground)]">
            חבר חשבון בנק או כרטיס אשראי כדי להתחיל לסנכרן עסקאות
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            חבר חשבון בנק
          </Link>
        </div>
      )}
    </div>
  )
}

function AccountCard({ account }: { account: BankAccount }) {
  const status = account.scrape_status ?? 'idle'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  const companyLabel = COMPANY_LABELS[account.company_id] ?? account.company_id

  return (
    <li className="glass-card p-5">
      <div className="flex items-start justify-between gap-4">
        {/* Account info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[var(--color-foreground)]">
              {account.display_name ?? companyLabel}
            </h3>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: statusCfg.bg, color: statusCfg.color }}
            >
              {statusCfg.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-[var(--color-foreground-muted)]">{companyLabel}</p>
          {account.last_scraped_at && (
            <p className="mt-1 text-xs text-[var(--color-foreground-dim)]">
              עדכון אחרון: {formatDate(account.last_scraped_at)}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ScrapeButton accountId={account.id} status={status} />
          <AccountActions accountId={account.id} companyId={account.company_id} displayName={account.display_name} />
        </div>
      </div>
    </li>
  )
}
