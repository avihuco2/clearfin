'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Field { key: string; label: string; type: 'text' | 'password'; placeholder: string }

const COMPANY_FIELDS: Record<string, Field[]> = {
  hapoalim: [
    { key: 'userCode', label: 'קוד משתמש', type: 'text', placeholder: '9 ספרות' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
  leumi: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'מספר זיהוי' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
  discount: [
    { key: 'id', label: 'תעודת זהות', type: 'text', placeholder: '9 ספרות' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
    { key: 'num', label: 'מספר משתמש', type: 'text', placeholder: 'מספר המשתמש שלך' },
  ],
  mizrahi: [
    { key: 'username', label: 'מספר משתמש', type: 'text', placeholder: 'מספר הזיהוי' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
  visaCal: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'דוא"ל' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
  max: [
    { key: 'username', label: 'שם משתמש', type: 'text', placeholder: 'דוא"ל' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
  isracard: [
    { key: 'id', label: 'תעודת זהות', type: 'text', placeholder: '9 ספרות' },
    { key: 'card6Digits', label: '6 ספרות אחרונות', type: 'text', placeholder: 'XXXXXX' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
  amex: [
    { key: 'id', label: 'תעודת זהות', type: 'text', placeholder: '9 ספרות' },
    { key: 'card6Digits', label: '6 ספרות אחרונות', type: 'text', placeholder: 'XXXXXX' },
    { key: 'password', label: 'סיסמה', type: 'password', placeholder: 'סיסמת האינטרנט' },
  ],
}

interface AccountActionsProps {
  accountId: string
  companyId: string
  displayName: string | null
}

export function AccountActions({ accountId, companyId, displayName }: AccountActionsProps) {
  const [showUpdate, setShowUpdate] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const router = useRouter()

  const companyFields = COMPANY_FIELDS[companyId] ?? []

  async function handleDelete() {
    if (!confirm(`למחוק את ${displayName ?? companyId}? לא ניתן לבטל פעולה זו.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        router.refresh()
      } else {
        setError('שגיאה במחיקת החשבון')
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setDeleting(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    const missing = companyFields.find(f => !fields[f.key]?.trim())
    if (missing) { setError(`נא למלא: ${missing.label}`); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: fields }),
      })
      if (res.ok) {
        setShowUpdate(false)
        setFields({})
        router.refresh()
      } else {
        const body = await res.json() as { error?: string }
        setError(body.error ?? 'שגיאה בעדכון')
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Update credentials button */}
      <button
        type="button"
        onClick={() => { setShowUpdate(!showUpdate); setError(null) }}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
        style={{
          background: 'rgba(245,158,11,0.08)',
          color: 'var(--color-gold)',
          border: '0.5px solid rgba(245,158,11,0.25)',
        }}
        aria-label="עדכן פרטי כניסה"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        עדכן
      </button>

      {/* Delete button */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
        style={{
          background: 'var(--color-danger-dim)',
          color: 'var(--color-danger)',
          border: '0.5px solid rgba(244,63,94,0.25)',
        }}
        aria-label="מחק חשבון"
      >
        {deleting ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-danger)] border-t-transparent" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        )}
        מחק
      </button>

      {/* Update credentials form */}
      {showUpdate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowUpdate(false) }}
        >
          <form
            onSubmit={handleUpdate}
            className="glass-strong w-full max-w-sm rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                עדכון פרטי כניסה
              </h2>
              <button type="button" onClick={() => setShowUpdate(false)} className="text-[var(--color-foreground-dim)] hover:text-[var(--color-foreground)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="סגור"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              </button>
            </div>

            <p className="text-xs text-[var(--color-foreground-muted)]">
              הכנס פרטי כניסה חדשים עבור {displayName ?? companyId}
            </p>

            {companyFields.map(field => (
              <div key={field.key} className="space-y-1">
                <label htmlFor={`update-${field.key}`}>{field.label}</label>
                <input
                  id={`update-${field.key}`}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={fields[field.key] ?? ''}
                  onChange={e => setFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                  autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                  dir="auto"
                />
              </div>
            ))}

            {error && (
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: '#000', boxShadow: '0 0 16px rgba(6,182,212,0.25)' }}
            >
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
