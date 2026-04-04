'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Category {
  id: string
  name_he: string
  name_en: string | null
  icon: string | null
  color: string | null
  user_id: string | null
  transactionCount?: number
}

interface Props {
  systemCategories: Category[]
  userCategories: Category[]
}

const DEFAULT_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#ef4444',
  '#f97316', '#eab308', '#6366f1', '#ec4899',
  '#10b981', '#6b7280', '#14b8a6', '#f43f5e',
]

// ─── Color swatches shared by add + edit forms ────────────────────────────────

function ColorSwatches({
  selected,
  onChange,
}: {
  selected: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DEFAULT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
          style={{
            background: c,
            borderColor: selected === c ? 'white' : 'transparent',
            boxShadow: selected === c ? `0 0 0 2px ${c}` : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ─── Inline form (shared by "add" card + edit mode) ───────────────────────────

interface InlineFormProps {
  initialName?: string
  initialIcon?: string
  initialColor?: string
  submitLabel: string
  onSubmit: (nameHe: string, icon: string, color: string) => Promise<void>
  onCancel: () => void
  saving: boolean
  error: string | null
}

function InlineForm({
  initialName = '',
  initialIcon = '',
  initialColor = '#3b82f6',
  submitLabel,
  onSubmit,
  onCancel,
  saving,
  error,
}: InlineFormProps) {
  const [nameHe, setNameHe] = useState(initialName)
  const [icon, setIcon] = useState(initialIcon)
  const [color, setColor] = useState(initialColor)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameHe.trim()) return
    await onSubmit(nameHe.trim(), icon.trim(), color)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Icon preview + name row */}
      <div className="flex items-center gap-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{ background: `${color}33` }}
        >
          {icon || '📦'}
        </span>
        <input
          type="text"
          value={nameHe}
          onChange={(e) => setNameHe(e.target.value)}
          placeholder="שם הקטגוריה"
          dir="rtl"
          maxLength={60}
          required
          autoFocus
          className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-transparent px-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🏠"
          maxLength={4}
          className="h-9 w-14 rounded-lg border border-[var(--color-border)] bg-transparent text-center text-base focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
      </div>

      {/* Color swatches */}
      <ColorSwatches selected={color} onChange={setColor} />

      {/* Error */}
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !nameHe.trim()}
          className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: '#000' }}
        >
          {saving ? '...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  )
}

// ─── Single category card ──────────────────────────────────────────────────────

function CategoryCard({
  cat,
  onUpdated,
  onDeleted,
}: {
  cat: Category
  onUpdated: (updated: Partial<Category>) => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSystem = cat.user_id === null
  const txCount = cat.transactionCount ?? 0

  async function handleSave(nameHe: string, icon: string, color: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameHe, icon, color }),
      })
      if (!res.ok) throw new Error()
      onUpdated({ name_he: nameHe, icon: icon || null, color })
      setEditing(false)
    } catch {
      setError('שגיאה בעדכון הקטגוריה')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const warningLine =
      txCount > 0
        ? `\n\n${txCount.toLocaleString('he-IL')} עסקאות ישארו ללא קטגוריה.`
        : ''
    if (!confirm(`למחוק את הקטגוריה "${cat.name_he}"?${warningLine}`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        onDeleted()
      } else {
        setError('שגיאה במחיקת הקטגוריה')
        setDeleting(false)
      }
    } catch {
      setError('שגיאת רשת')
      setDeleting(false)
    }
  }

  // ── Edit mode ─────────────────────────────────────────────────
  if (editing) {
    return (
      <div
        className="glass-card p-4 transition-all"
        style={{ borderColor: 'var(--color-primary)' }}
      >
        <InlineForm
          initialName={cat.name_he}
          initialIcon={cat.icon ?? ''}
          initialColor={cat.color ?? '#3b82f6'}
          submitLabel="שמור"
          onSubmit={handleSave}
          onCancel={() => { setEditing(false); setError(null) }}
          saving={saving}
          error={error}
        />
      </div>
    )
  }

  // ── Display mode ──────────────────────────────────────────────
  return (
    <div className="glass-card group relative flex flex-col gap-3 p-4 transition-all hover:border-[var(--color-border)]">
      {/* Icon circle */}
      <div className="flex items-center justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
          style={{ background: cat.color ? `${cat.color}33` : 'rgba(255,255,255,0.06)' }}
        >
          {cat.icon ?? '📦'}
        </span>

        {/* System badge */}
        {isSystem && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--color-muted-foreground)] border border-[var(--color-border)]">
            מערכת
          </span>
        )}

        {/* User category action buttons — appear on hover */}
        {!isSystem && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="ערוך"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--color-foreground)]"
            >
              {/* Pencil icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="מחק"
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[rgba(239,68,68,0.12)] disabled:opacity-40"
              style={{ color: 'var(--color-danger)' }}
            >
              {/* Trash icon */}
              {deleting ? (
                <span className="text-xs">...</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Category name */}
      <div>
        <p className="text-sm font-semibold text-[var(--color-foreground)]">{cat.name_he}</p>
        {cat.name_en && (
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{cat.name_en}</p>
        )}
      </div>

      {/* Transaction count */}
      <span
        className="self-start rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          background: cat.color ? `${cat.color}22` : 'rgba(255,255,255,0.06)',
          color: cat.color ?? 'var(--color-muted-foreground)',
        }}
      >
        {txCount.toLocaleString('he-IL')} עסקאות
      </span>

      {/* Inline delete error */}
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

// ─── "Add new" dashed card ────────────────────────────────────────────────────

function AddCategoryCard({ onAdded }: { onAdded: (cat: Category) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(nameHe: string, icon: string, color: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameHe, icon: icon || undefined, color }),
      })
      if (!res.ok) throw new Error()
      const created = (await res.json()) as Category
      onAdded({ ...created, transactionCount: 0 })
      setOpen(false)
    } catch {
      setError('שגיאה ביצירת הקטגוריה')
    } finally {
      setSaving(false)
    }
  }

  if (open) {
    return (
      <div
        className="glass-card p-4 transition-all"
        style={{ borderColor: 'var(--color-primary)' }}
      >
        <p className="mb-3 text-xs font-semibold text-[var(--color-muted-foreground)]">קטגוריה חדשה</p>
        <InlineForm
          submitLabel="צור קטגוריה"
          onSubmit={handleSubmit}
          onCancel={() => { setOpen(false); setError(null) }}
          saving={saving}
          error={error}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current text-xl font-light">
        +
      </span>
      <span className="text-sm font-medium">הוסף קטגוריה</span>
    </button>
  )
}

// ─── Category grid section ────────────────────────────────────────────────────

function CategorySection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)]">{title}</h2>
        <span className="rounded-full px-2 py-0.5 text-xs text-[var(--color-muted-foreground)] border border-[var(--color-border)]">
          {count}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </section>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function CategoryManager({ systemCategories, userCategories }: Props) {
  const router = useRouter()
  const [userCats, setUserCats] = useState<Category[]>(userCategories)

  function handleAdded(cat: Category) {
    setUserCats((prev) =>
      [...prev, cat].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he')),
    )
    router.refresh()
  }

  function handleUpdated(id: string, patch: Partial<Category>) {
    setUserCats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
  }

  function handleDeleted(id: string) {
    setUserCats((prev) => prev.filter((c) => c.id !== id))
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* User categories section */}
      <CategorySection title="קטגוריות אישיות" count={userCats.length}>
        {userCats.map((cat) => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            onUpdated={(patch) => handleUpdated(cat.id, patch)}
            onDeleted={() => handleDeleted(cat.id)}
          />
        ))}
        <AddCategoryCard onAdded={handleAdded} />
      </CategorySection>

      {/* System categories section */}
      <CategorySection title="קטגוריות מערכת" count={systemCategories.length}>
        {systemCategories.map((cat) => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            onUpdated={() => {}}
            onDeleted={() => {}}
          />
        ))}
      </CategorySection>
    </div>
  )
}
