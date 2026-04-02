'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { API_ROUTES } from '@/lib/api-routes'

const COMPANIES = [
  { id: 'hapoalim', label: 'בנק הפועלים' },
  { id: 'leumi', label: 'בנק לאומי' },
  { id: 'discount', label: 'בנק דיסקונט' },
  { id: 'mizrahi', label: 'בנק מזרחי טפחות' },
  { id: 'visaCal', label: 'ויזה כ.א.ל' },
  { id: 'max', label: 'מקס (לאומי קארד)' },
  { id: 'isracard', label: 'ישראכארד' },
  { id: 'amex', label: 'אמריקן אקספרס' },
] as const

type CompanyId = (typeof COMPANIES)[number]['id']

// Field definitions per company
const COMPANY_FIELDS: Record<
  CompanyId,
  Array<{ key: string; label: string; type: 'text' | 'password'; placeholder: string }>
> = {
  hapoalim: [
    { key: 'userCode', label: 'קוד משתמש', type: 'text', placeholder: '9 ספרות' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
  leumi: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'מספר זיהוי' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
  discount: [
    { key: 'id', label: 'תעודת זהות', type: 'text', placeholder: '9 ספרות' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
    { key: 'num', label: 'מספר משתמש', type: 'text', placeholder: 'מספר משתמש' },
  ],
  mizrahi: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'מספר משתמש' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
  visaCal: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'דוא"ל או מספר זיהוי' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
  max: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'דוא"ל' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
  isracard: [
    { key: 'id', label: 'תעודת זהות', type: 'text', placeholder: '9 ספרות' },
    { key: 'card6Digits', label: '6 ספרות אחרונות של הכרטיס', type: 'text', placeholder: 'XXXXXX' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
  amex: [
    { key: 'id', label: 'תעודת זהות', type: 'text', placeholder: '9 ספרות' },
    { key: 'card6Digits', label: '6 ספרות אחרונות של הכרטיס', type: 'text', placeholder: 'XXXXXX' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט שלך' },
  ],
}

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

export default function NewAccountPage() {
  const router = useRouter()
  const [selectedCompany, setSelectedCompany] = useState<CompanyId | ''>('')
  const [displayName, setDisplayName] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [formState, setFormState] = useState<FormState>({ status: 'idle' })

  type FieldDef = { key: string; label: string; type: 'text' | 'password'; placeholder: string }
  const fields: FieldDef[] =
    selectedCompany ? COMPANY_FIELDS[selectedCompany as CompanyId] : []

  function handleCredentialChange(key: string, value: string) {
    setCredentials((prev: Record<string, string>) => ({ ...prev, [key]: value }))
  }

  function handleCompanyChange(id: CompanyId | '') {
    setSelectedCompany(id)
    setCredentials({})
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedCompany) return

    // Validate all required fields are filled
    const missingField = fields.find((f) => !credentials[f.key]?.trim())
    if (missingField) {
      setFormState({ status: 'error', message: `נא למלא את השדה: ${missingField.label}` })
      return
    }

    setFormState({ status: 'loading' })

    try {
      const res = await fetch(API_ROUTES.accounts.create, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompany,
          credentials,
          displayName: displayName.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}))
        const rawError =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof (body as Record<string, unknown>)['error'] === 'string'
            ? (body as Record<string, string>)['error']
            : undefined
        const message: string = rawError ?? 'שגיאה בשמירת החשבון'
        setFormState({ status: 'error', message })
        return
      }

      setFormState({ status: 'success' })
      router.push('/accounts')
    } catch {
      setFormState({ status: 'error', message: 'שגיאת רשת. נסה שוב.' })
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">הוסף חשבון בנק</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          פרטי ההתחברות מוצפנים ומאוחסנים בצורה מאובטחת
        </p>
      </div>

      {/* Success banner */}
      {formState.status === 'success' && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700"
        >
          החשבון נוסף בהצלחה! מעביר לדף החשבונות...
        </div>
      )}

      {/* Error banner */}
      {formState.status === 'error' && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {formState.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm space-y-5"
        noValidate
      >
        {/* Company selector */}
        <div className="space-y-1.5">
          <label
            htmlFor="company"
            className="block text-sm font-medium text-[var(--color-foreground)]"
          >
            בחר מוסד פיננסי
          </label>
          <select
            id="company"
            value={selectedCompany}
            onChange={(e) => handleCompanyChange(e.target.value as CompanyId | '')}
            required
            className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          >
            <option value="">-- בחר --</option>
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Display name (optional) */}
        <div className="space-y-1.5">
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-[var(--color-foreground)]"
          >
            שם תצוגה{' '}
            <span className="font-normal text-[var(--color-muted-foreground)]">(אופציונלי)</span>
          </label>
          <input
            id="displayName"
            type="text"
            dir="auto"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="למשל: חשבון עו&quot;ש ראשי"
            className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        {/* Dynamic credential fields */}
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label
              htmlFor={field.key}
              className="block text-sm font-medium text-[var(--color-foreground)]"
            >
              {field.label}
            </label>
            <input
              id={field.key}
              type={field.type}
              dir="auto"
              value={credentials[field.key] ?? ''}
              onChange={(e) => handleCredentialChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              required
              autoComplete={field.type === 'password' ? 'current-password' : 'off'}
              className="block w-full rounded-lg border border-[var(--color-input)] bg-white px-3 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        ))}

        {/* Security note */}
        {selectedCompany && (
          <p className="flex items-start gap-2 rounded-lg bg-[var(--color-accent)] p-3 text-xs text-[var(--color-accent-foreground)]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            הפרטים מוצפנים עם AES-256-GCM לפני השמירה. ClearFin לא שומר סיסמאות בטקסט גלוי.
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={!selectedCompany || formState.status === 'loading'}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {formState.status === 'loading' && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {formState.status === 'loading' ? 'שומר...' : 'הוסף חשבון'}
          </button>
        </div>
      </form>
    </div>
  )
}
