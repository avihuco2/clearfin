import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
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
  transactions: { count: number }[]
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
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from('bank_accounts')
      .select('id, company_id, display_name, last_scraped_at')
      .order('created_at', { ascending: false })
      .returns<BankAccount[]>(),
    supabase
      .from('categories')
      .select('id, name_he, name_en, icon, color, user_id, transactions(count)')
      .order('name_he', { ascending: true })
      .returns<CategoryWithCount[]>(),
  ])

  const displayName =
    session?.user.user_metadata?.['full_name'] ?? session?.user.email ?? 'משתמש'
  const email = session?.user.email ?? ''

  const enriched = (categories ?? []).map((c) => ({
    ...c,
    transactionCount: c.transactions?.[0]?.count ?? 0,
  }))
  const systemCategories = enriched.filter((c) => c.user_id === null)
  const userCategories = enriched.filter((c) => c.user_id !== null)

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
        accounts={(accounts ?? []).map((a) => ({
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
