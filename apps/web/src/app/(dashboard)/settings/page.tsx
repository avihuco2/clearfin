import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { SettingsForm } from './settings-form'

interface BankAccount {
  id: string
  company_id: string
  display_name: string | null
  last_scraped_at: string | null
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

  const { data: accounts } = await supabase
    .from('bank_accounts')
    .select('id, company_id, display_name, last_scraped_at')
    .order('created_at', { ascending: false })
    .returns<BankAccount[]>()

  const displayName =
    session?.user.user_metadata?.['full_name'] ?? session?.user.email ?? 'משתמש'
  const email = session?.user.email ?? ''

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
    </div>
  )
}
