import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { sql } from '@clearfin/db/client'
import { SettingsForm } from './settings-form'
import { CategoryManager } from '@/components/category-manager'

interface BankAccount {
  id: string
  company_id: string
  display_name: string | null
  last_scraped_at: string | null
}

interface CategoryWithCount {
  id: string
  name_he: string
  name_en: string | null
  icon: string | null
  color: string | null
  user_id: string | null
  transactionCount: number
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

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [accounts, categories] = await Promise.all([
    sql<BankAccount[]>`
      SELECT id, company_id, display_name, last_scraped_at
      FROM bank_accounts
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `,
    sql<CategoryWithCount[]>`
      SELECT
        c.id, c.name_he, c.name_en, c.icon, c.color, c.user_id,
        COUNT(t.id)::int AS "transactionCount"
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = ${userId}
      WHERE c.user_id IS NULL OR c.user_id = ${userId}
      GROUP BY c.id
      ORDER BY c.name_he ASC
    `,
  ])

  const displayName = session.user.name ?? session.user.email ?? 'משתמש'
  const email = session.user.email ?? ''

  const systemCategories = categories.filter((c) => c.user_id === null)
  const userCategories = categories.filter((c) => c.user_id !== null)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">הגדרות</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          נהל את פרטי חשבונך והעדפותיך
        </p>
      </div>

      <SettingsForm
        displayName={displayName}
        email={email}
        accounts={accounts.map((a) => ({
          ...a,
          companyLabel: COMPANY_LABELS[a.company_id] ?? a.company_id,
        }))}
      />

      {/* ── Categories section ── */}
      <section aria-labelledby="categories-heading">
        <div className="mb-4">
          <h2
            id="categories-heading"
            className="text-base font-semibold text-[var(--color-foreground)]"
          >
            ניהול קטגוריות
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
            הוסף, ערוך ומחק קטגוריות לסיווג עסקאות
          </p>
        </div>
        <CategoryManager systemCategories={systemCategories} userCategories={userCategories} />
      </section>
    </div>
  )
}
