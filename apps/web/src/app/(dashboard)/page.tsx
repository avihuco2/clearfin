import Link from 'next/link'
import { auth } from '@/lib/auth'
import { sql } from '@clearfin/db/client'
import { formatCurrency } from '@/lib/format'
import { ScrapeAllButton } from '@/components/scrape-all-button'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const displayName =
    (session.user.name ?? session.user.email ?? 'משתמש').split(' ')[0]

  const [accountsRes, txRes, pendingRes] = await Promise.all([
    sql`SELECT COUNT(*) FROM bank_accounts WHERE user_id = ${userId}`,
    sql`SELECT charged_amount FROM transactions WHERE user_id = ${userId} ORDER BY date DESC LIMIT 200`,
    sql`SELECT COUNT(*) FROM transactions WHERE user_id = ${userId} AND category_id IS NULL`,
  ])

  const accountCount = Number(accountsRes[0]?.count ?? 0)
  const txRows = txRes as { charged_amount: number }[]
  const txCount = txRows.length
  const pendingCount = Number(pendingRes[0]?.count ?? 0)
  const totalSpent = txRows.reduce((s, t) => s + (t.charged_amount ?? 0), 0)

  return (
    <div className="space-y-7">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <p className="text-sm text-[var(--color-foreground-muted)]">שלום,</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--color-foreground)]">
            {displayName} 👋
          </h1>
        </div>
        <ScrapeAllButton />
      </div>

      {accountCount === 0 ? (
        /* ── Empty state ───────────────────────────────────── */
        <div
          className="animate-fade-up delay-100 flex flex-col items-center justify-center rounded-2xl py-20 text-center"
          style={{ border: '1px dashed var(--color-border-strong)' }}
        >
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'var(--color-primary-dim)', color: 'var(--color-primary)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
          </div>
          <h2 className="mb-2 text-base font-semibold text-[var(--color-foreground)]">לא חוברו חשבונות עדיין</h2>
          <p className="mb-7 max-w-xs text-sm text-[var(--color-foreground-muted)]">
            חבר את חשבון הבנק או כרטיס האשראי שלך כדי להתחיל
          </p>
          <Link
            href="/accounts/new"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all"
            style={{
              background: 'var(--color-primary)',
              color: '#000',
              boxShadow: '0 0 18px rgba(6,182,212,0.25)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            חבר חשבון
          </Link>
        </div>
      ) : (
        <>
          {/* ── Stat cards ────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 animate-fade-up delay-100">
            <StatCard
              label="סה״כ הוצאות"
              value={formatCurrency(Math.abs(totalSpent))}
              sub="כל הזמנים"
              color="cyan"
            />
            <StatCard
              label="עסקאות"
              value={txCount.toLocaleString('he-IL')}
              sub="מוכרות"
              color="gold"
            />
            <StatCard
              label="חשבונות"
              value={accountCount.toString()}
              sub="מחוברים"
              color="success"
            />
            <StatCard
              label="לסיווג"
              value={pendingCount.toString()}
              sub="ממתינות"
              color={pendingCount > 0 ? 'warn' : 'muted'}
              href={pendingCount > 0 ? '/transactions' : undefined}
            />
          </div>

          {/* ── Quick actions ─────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 animate-fade-up delay-200">
            <QuickAction
              href="/transactions"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M3 12h18M3 18h12" />
                </svg>
              }
              label="כל העסקאות"
              desc="צפה, סנן וסווג"
            />
            <QuickAction
              href="/accounts"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                </svg>
              }
              label="חשבונות"
              desc="נהל חיבורים"
            />
          </div>
        </>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────── */

const colorMap = {
  cyan:    { bg: 'var(--color-primary-dim)',  text: 'var(--color-primary)',  border: 'rgba(6,182,212,0.15)' },
  gold:    { bg: 'var(--color-gold-dim)',     text: 'var(--color-gold)',     border: 'rgba(245,158,11,0.15)' },
  success: { bg: 'var(--color-success-dim)', text: 'var(--color-success)',  border: 'rgba(16,185,129,0.15)' },
  warn:    { bg: 'rgba(245,158,11,0.1)',     text: 'var(--color-warning)',  border: 'rgba(245,158,11,0.2)' },
  muted:   { bg: 'var(--color-surface-2)',   text: 'var(--color-foreground-muted)', border: 'var(--color-border)' },
}

function StatCard({ label, value, sub, color, href }: {
  label: string
  value: string
  sub: string
  color: keyof typeof colorMap
  href?: string
}) {
  const c = colorMap[color]
  const inner = (
    <div className="glass-card p-4" style={{ borderColor: c.border }}>
      <p className="mb-3 text-xs font-medium text-[var(--color-foreground-muted)]">{label}</p>
      <p className="animate-num-in text-xl font-bold leading-none" style={{ color: c.text }}>{value}</p>
      <p className="mt-1.5 text-[11px] text-[var(--color-foreground-dim)]">{sub}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>
}

function QuickAction({ href, icon, label, desc }: {
  href: string
  icon: React.ReactNode
  label: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="glass-card flex items-center gap-4 p-4"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'var(--color-primary-dim)', color: 'var(--color-primary)' }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">{label}</p>
        <p className="text-xs text-[var(--color-foreground-muted)]">{desc}</p>
      </div>
      <svg className="ms-auto shrink-0 rotate-180 text-[var(--color-foreground-dim)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
