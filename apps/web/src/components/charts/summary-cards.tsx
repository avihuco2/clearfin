import Link from 'next/link'
import { formatCurrency } from '@/lib/format'

interface SummaryCardsProps {
  totalSpend: number
  transactionCount: number
  topCategory: string | null
  uncategorizedCount: number
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string
  value: string
  sub?: string
  href?: string
}) {
  const card = (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold text-[var(--color-foreground)]">{value}</p>
      {sub && (
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{sub}</p>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-80">
        {card}
      </Link>
    )
  }
  return card
}

export function SummaryCards({
  totalSpend,
  transactionCount,
  topCategory,
  uncategorizedCount,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        label='סה"כ הוצאות החודש'
        value={formatCurrency(totalSpend)}
      />
      <StatCard
        label="מספר עסקאות"
        value={transactionCount.toLocaleString('he-IL')}
        sub="החודש הנוכחי"
      />
      <StatCard
        label="קטגוריה מובילה"
        value={topCategory ?? '—'}
      />
      <StatCard
        label="עסקאות ללא סיווג"
        value={uncategorizedCount.toLocaleString('he-IL')}
        sub={uncategorizedCount > 0 ? 'לחץ לסיווג' : undefined}
        href={uncategorizedCount > 0 ? '/transactions' : undefined}
      />
    </div>
  )
}
