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

export function CategoryManager({ systemCategories, userCategories }: Props) {
  const router = useRouter()
  const [userCats, setUserCats] = useState<Category[]>(userCategories)
  const [nameHe, setNameHe] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nameHe.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameHe: nameHe.trim(), icon: icon.trim() || undefined, color }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json() as Category
      setUserCats((prev) => [...prev, created].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he')))
      setNameHe('')
      setIcon('')
      setColor('#3b82f6')
      router.refresh()
    } catch {
      setError('שגיאה ביצירת הקטגוריה')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`למחוק את הקטגוריה "${name}"?`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setUserCats((prev) => prev.filter((c) => c.id !== id))
        router.refresh()
      } else {
        setError('שגיאה במחיקת הקטגוריה')
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add new category form */}
      <div className="glass-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-foreground)]">הוסף קטגוריה חדשה</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px] space-y-1">
            <label className="text-xs text-[var(--color-muted-foreground)]">שם בעברית</label>
            <input
              type="text"
              value={nameHe}
              onChange={(e) => setNameHe(e.target.value)}
              placeholder="למשל: ביטוח"
              dir="rtl"
              maxLength={60}
              required
              className="w-full"
            />
          </div>
          <div className="w-24 space-y-1">
            <label className="text-xs text-[var(--color-muted-foreground)]">אייקון (אמוג׳י)</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🏠"
              maxLength={4}
              className="w-full text-center"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted-foreground)]">צבע</label>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: color === c ? 'white' : 'transparent',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !nameHe.trim()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: '#000' }}
          >
            {saving ? '...' : '+ הוסף'}
          </button>
        </form>
        {error && <p className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      {/* User categories */}
      {userCats.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
            קטגוריות אישיות
            <span className="ms-2 text-xs font-normal text-[var(--color-muted-foreground)]">({userCats.length})</span>
          </h2>
          <ul className="space-y-2">
            {userCats.map((cat) => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                deletable
                deleting={deletingId === cat.id}
                onDelete={() => handleDelete(cat.id, cat.name_he)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* System categories */}
      <div className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
          קטגוריות מערכת
          <span className="ms-2 text-xs font-normal text-[var(--color-muted-foreground)]">({systemCategories.length})</span>
        </h2>
        <ul className="space-y-2">
          {systemCategories.map((cat) => (
            <CategoryRow key={cat.id} cat={cat} deletable={false} deleting={false} onDelete={() => {}} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function CategoryRow({
  cat,
  deletable,
  deleting,
  onDelete,
}: {
  cat: Category
  deletable: boolean
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-[var(--color-muted)]/40 transition-colors">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
          style={{ background: cat.color ? `${cat.color}22` : 'rgba(255,255,255,0.06)' }}
        >
          {cat.icon ?? '📦'}
        </span>
        <div>
          <p className="text-sm font-medium text-[var(--color-foreground)]">{cat.name_he}</p>
          {cat.name_en && (
            <p className="text-xs text-[var(--color-muted-foreground)]">{cat.name_en}</p>
          )}
        </div>
      </div>
      {deletable ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-40 transition-colors"
          style={{ color: 'var(--color-danger)', background: 'var(--color-danger-dim)' }}
        >
          {deleting ? '...' : 'מחק'}
        </button>
      ) : (
        <span className="text-xs text-[var(--color-muted-foreground)]">מערכת</span>
      )}
    </li>
  )
}
