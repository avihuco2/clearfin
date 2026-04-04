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

// ── Inline form (shared by Add + Edit) ─────────────────────────────────────

interface InlineFormProps {
  initial?: { nameHe: string; icon: string; color: string }
  onSave: (nameHe: string, icon: string, color: string) => Promise<void>
  onCancel: () => void
}

function InlineForm({ initial, onSave, onCancel }: InlineFormProps) {
  const [nameHe, setNameHe] = useState(initial?.nameHe ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [color, setColor] = useState(initial?.color ?? '#3b82f6')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameHe.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(nameHe.trim(), icon.trim(), color)
    } catch {
      setError('שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{ background: 'rgba(16,24,40,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.12)' }}
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🏠"
          maxLength={4}
          style={{
            width: 48, textAlign: 'center', fontSize: '1.2rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '4px 6px', color: '#f0f4ff',
          }}
        />
        <input
          type="text"
          value={nameHe}
          onChange={(e) => setNameHe(e.target.value)}
          placeholder="שם קטגוריה"
          dir="rtl"
          maxLength={60}
          required
          autoFocus
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '4px 10px', color: '#f0f4ff', fontSize: '0.875rem',
          }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEFAULT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className="h-6 w-6 rounded-full transition-transform hover:scale-110"
            style={{
              background: c,
              border: color === c ? '2px solid white' : '2px solid transparent',
              boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
            }}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !nameHe.trim()}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: '#000' }}
        >
          {saving ? '...' : 'שמור'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          ביטול
        </button>
      </div>
    </form>
  )
}

// ── Category card ───────────────────────────────────────────────────────────

interface CategoryCardProps {
  cat: Category
  onUpdated: (updated: Category) => void
  onDeleted: (id: string) => void
}

function CategoryCard({ cat, onUpdated, onDeleted }: CategoryCardProps) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const txCount = cat.transactionCount ?? 0
  const isSystem = cat.user_id === null

  async function handleSave(nameHe: string, icon: string, color: string) {
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameHe, icon, color }),
    })
    if (!res.ok) throw new Error('save failed')
    onUpdated({ ...cat, name_he: nameHe, icon: icon || null, color })
    setEditing(false)
  }

  async function handleDelete() {
    const warning = txCount > 0
      ? `\n\n${txCount.toLocaleString('he-IL')} עסקאות ישארו ללא קטגוריה.`
      : ''
    if (!confirm(`למחוק את "${cat.name_he}"?${warning}`)) return
    setDeleting(true)
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      onDeleted(cat.id)
    } else {
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <InlineForm
        initial={{ nameHe: cat.name_he, icon: cat.icon ?? '', color: cat.color ?? '#3b82f6' }}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      className="group relative flex flex-col gap-2 rounded-xl p-4 transition-all"
      style={{
        background: 'rgba(16,24,40,0.6)',
        backdropFilter: 'blur(20px)',
        border: '0.5px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Color accent bar on the end side */}
      {cat.color && (
        <div
          className="absolute end-0 top-3 bottom-3 w-0.5 rounded-full"
          style={{ background: cat.color, opacity: 0.6 }}
        />
      )}

      {/* Icon circle */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
        style={{ background: cat.color ? `${cat.color}26` : 'rgba(255,255,255,0.06)' }}
      >
        {cat.icon ?? '📦'}
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-[var(--color-foreground)] leading-tight">{cat.name_he}</p>

      {/* Transaction count */}
      {txCount > 0 && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {txCount.toLocaleString('he-IL')} עסקאות
        </p>
      )}

      {/* Actions */}
      {isSystem ? (
        <span
          className="self-start rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          מערכת
        </span>
      ) : (
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-white/10 hover:text-[var(--color-foreground)] opacity-0 group-hover:opacity-100"
            title="עריכה"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg p-1.5 transition-colors hover:bg-red-500/10 disabled:opacity-40"
            style={{ color: 'var(--color-danger)' }}
            title="מחיקה"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function CategoryManager({ systemCategories, userCategories }: Props) {
  const router = useRouter()
  const [userCats, setUserCats] = useState<Category[]>(userCategories)
  const [adding, setAdding] = useState(false)

  function handleUpdated(updated: Category) {
    setUserCats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    router.refresh()
  }

  function handleDeleted(id: string) {
    setUserCats((prev) => prev.filter((c) => c.id !== id))
    router.refresh()
  }

  async function handleAdd(nameHe: string, icon: string, color: string) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameHe, icon: icon || undefined, color }),
    })
    if (!res.ok) throw new Error('create failed')
    const created = (await res.json()) as Category
    setUserCats((prev) =>
      [...prev, { ...created, transactionCount: 0 }].sort((a, b) =>
        a.name_he.localeCompare(b.name_he, 'he'),
      ),
    )
    setAdding(false)
    router.refresh()
  }

  return (
    <div className="space-y-10">
      {/* ── User categories ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
            קטגוריות אישיות
            <span className="ms-2 text-xs font-normal text-[var(--color-muted-foreground)]">
              ({userCats.length})
            </span>
          </h2>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: 'var(--color-primary)', color: '#000' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              הוסף קטגוריה
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-4">
            <InlineForm onSave={handleAdd} onCancel={() => setAdding(false)} />
          </div>
        )}

        {userCats.length === 0 && !adding ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-12 text-center">
            <p className="text-sm text-[var(--color-muted-foreground)]">אין קטגוריות אישיות עדיין</p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-3 text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              הוסף קטגוריה ראשונה
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {userCats.map((cat) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── System categories ── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-foreground)]">
          קטגוריות מערכת
          <span className="ms-2 text-xs font-normal text-[var(--color-muted-foreground)]">
            ({systemCategories.length})
          </span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {systemCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              onUpdated={() => {}}
              onDeleted={() => {}}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
