'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/format'
import { API_ROUTES } from '@/lib/api-routes'

interface AccountItem {
  id: string
  company_id: string
  display_name: string | null
  last_scraped_at: string | null
  companyLabel: string
}

interface SettingsFormProps {
  displayName: string
  email: string
  accounts: AccountItem[]
}

type ScrapeFrequency = '6h' | '12h' | '24h' | 'manual'

const FREQUENCY_OPTIONS: { value: ScrapeFrequency; label: string }[] = [
  { value: '6h', label: 'כל 6 שעות' },
  { value: '12h', label: 'כל 12 שעות' },
  { value: '24h', label: 'פעם ביום' },
  { value: 'manual', label: 'ידנית בלבד' },
]

export function SettingsForm({ displayName, email, accounts }: SettingsFormProps) {
  const router = useRouter()
  const supabase = createBrowserClient()

  // Profile section
  const [name, setName] = useState(displayName)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  // Frequency section
  const [frequency, setFrequency] = useState<ScrapeFrequency>('6h')
  const [frequencySaved, setFrequencySaved] = useState(false)

  // Account delete
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [localAccounts, setLocalAccounts] = useState(accounts)

  // Sign-out
  const [signingOut, setSigningOut] = useState(false)

  // --- Save display name ---
  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setNameSaving(true)
    setNameError(null)
    setNameSuccess(false)

    const { error } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    })

    if (error) {
      setNameError('שגיאה בשמירת השם. נסה שוב.')
    } else {
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 2500)
    }
    setNameSaving(false)
  }

  // --- Save frequency (UI stub) ---
  function handleSaveFrequency() {
    setFrequencySaved(true)
    setTimeout(() => setFrequencySaved(false), 2000)
  }

  // --- Delete account ---
  async function handleDeleteAccount(id: string) {
    if (!confirm('האם למחוק חשבון זה? הפעולה בלתי הפיכה.')) return
    setDeletingId(id)
    setDeleteError(null)

    try {
      const res = await fetch(API_ROUTES.accounts.delete(id), { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setLocalAccounts((prev) => prev.filter((a) => a.id !== id))
        router.refresh()
      } else {
        setDeleteError('שגיאה במחיקת החשבון. נסה שוב.')
      }
    } catch {
      setDeleteError('שגיאת רשת. נסה שוב.')
    } finally {
      setDeletingId(null)
    }
  }

  // --- Sign out ---
  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="space-y-10">
      {/* ── Section 1: פרטי משתמש ── */}
      <section aria-labelledby="profile-heading">
        <h2
          id="profile-heading"
          className="mb-4 text-base font-semibold text-[var(--color-foreground)]"
        >
          פרטי משתמש
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm">
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label
                htmlFor="display-name"
                className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
              >
                שם מלא
              </label>
              <input
                id="display-name"
                type="text"
                dir="auto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                className="w-full max-w-sm rounded-lg border border-[var(--color-input)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
              >
                כתובת אימייל
              </label>
              <input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                readOnly
                disabled
                className="w-full max-w-sm cursor-not-allowed rounded-lg border border-[var(--color-input)] bg-gray-50 px-3 py-2 text-sm text-[var(--color-muted-foreground)]"
              />
            </div>

            <div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                שפת ממשק: <span className="font-medium text-[var(--color-foreground)]">עברית (he-IL)</span>
              </p>
            </div>

            {nameError && (
              <p role="alert" className="text-sm text-red-600">
                {nameError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={nameSaving}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {nameSaving ? 'שומר...' : 'שמור שינויים'}
              </button>
              {nameSuccess && (
                <p className="text-sm font-medium text-green-700">נשמר בהצלחה</p>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* ── Section 2: חשבונות מחוברים ── */}
      <section aria-labelledby="accounts-heading">
        <h2
          id="accounts-heading"
          className="mb-4 text-base font-semibold text-[var(--color-foreground)]"
        >
          חשבונות מחוברים
        </h2>

        {deleteError && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {deleteError}
          </p>
        )}

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
          {localAccounts.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-muted-foreground)]">
              אין חשבונות מחוברים.{' '}
              <a
                href="/accounts/new"
                className="text-[var(--color-primary)] underline-offset-2 hover:underline"
              >
                חבר חשבון
              </a>
            </p>
          ) : (
            <table className="w-full text-sm" aria-label="חשבונות מחוברים">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    חשבון
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]"
                  >
                    עדכון אחרון
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">פעולות</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {localAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-[var(--color-muted)]/40">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {account.display_name ?? account.companyLabel}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {account.companyLabel}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--color-muted-foreground)]">
                      {account.last_scraped_at
                        ? formatDate(account.last_scraped_at)
                        : 'לא נסרק'}
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(account.id)}
                        disabled={deletingId === account.id}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === account.id ? 'מוחק...' : 'מחק'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Section 3: תדירות משיכת עסקאות ── */}
      <section aria-labelledby="frequency-heading">
        <h2
          id="frequency-heading"
          className="mb-4 text-base font-semibold text-[var(--color-foreground)]"
        >
          תדירות משיכת עסקאות
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="scrape-frequency"
                className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
              >
                סנכרן אוטומטי
              </label>
              <select
                id="scrape-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScrapeFrequency)}
                className="rounded-lg border border-[var(--color-input)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveFrequency}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                שמור הגדרות
              </button>
              {frequencySaved && (
                <p className="text-sm font-medium text-green-700">נשמר בהצלחה</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: יציאה מהמערכת ── */}
      <section aria-labelledby="signout-heading">
        <h2
          id="signout-heading"
          className="mb-4 text-base font-semibold text-[var(--color-foreground)]"
        >
          יציאה מהמערכת
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm">
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            יציאה תנתק אותך מכל המכשירים.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
          >
            {signingOut ? 'מתנתק...' : 'התנתק מהמערכת'}
          </button>
        </div>
      </section>
    </div>
  )
}
