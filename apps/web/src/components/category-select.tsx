'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { API_ROUTES } from '@/lib/api-routes'
import { useCategories } from '@/lib/categories-context'

// Re-export so callers that import CategoryOption from here still work
export type { CategoryOption } from '@/lib/categories-context'

interface CategorySelectProps {
  transactionId: string
  currentCategoryId: string | null
}

type SaveState = 'idle' | 'saving' | 'success' | 'error'

const NEW_CATEGORY_VALUE = '__new__'

export function CategorySelect({ transactionId, currentCategoryId }: CategorySelectProps) {
  const { categories, addCategory } = useCategories()
  const [selected, setSelected] = useState<string | null>(currentCategoryId)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    setSelected(currentCategoryId)
  }, [currentCategoryId])

  useEffect(() => {
    if (showNewInput) inputRef.current?.focus()
  }, [showNewInput])

  const selectedCategory = categories.find((c) => c.id === selected)

  async function saveCategory(categoryId: string | null) {
    setSaveState('saving')
    try {
      const res = await fetch(API_ROUTES.transactions.update(transactionId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      })
      if (!res.ok) throw new Error('save failed')
      setSaveState('success')
      setTimeout(() => setSaveState('idle'), 1500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
      throw new Error('save failed')
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value

    if (value === NEW_CATEGORY_VALUE) {
      setShowNewInput(true)
      return
    }

    const newValue = value || null
    const previous = selected
    setSelected(newValue)

    try {
      await saveCategory(newValue)
    } catch {
      setSelected(previous)
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return

    setCreating(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameHe: trimmed }),
      })
      if (!res.ok) throw new Error('create failed')

      const created = (await res.json()) as { id: string; name_he: string }
      const newCat = { id: created.id, name_he: created.name_he }

      addCategory(newCat)
      setSelected(created.id)
      setShowNewInput(false)
      setNewName('')

      await saveCategory(created.id)
      router.refresh()
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    } finally {
      setCreating(false)
    }
  }

  if (showNewInput) {
    return (
      <form onSubmit={handleCreateCategory} className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="שם קטגוריה"
          dir="rtl"
          maxLength={60}
          className="w-28 rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-2 py-1 text-xs text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded px-1.5 py-1 text-xs font-medium text-[var(--color-primary)] disabled:opacity-40 hover:bg-[var(--color-accent)]"
        >
          {creating ? '...' : '✓'}
        </button>
        <button
          type="button"
          onClick={() => { setShowNewInput(false); setNewName('') }}
          className="rounded px-1.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          ✕
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected ?? ''}
        onChange={handleChange}
        disabled={saveState === 'saving'}
        dir="rtl"
        aria-label="בחר קטגוריה"
        className={[
          'h-7 max-w-[160px] cursor-pointer rounded-full px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          selected
            ? 'border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
            : 'border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-foreground)]',
        ].join(' ')}
      >
        <option value="">ללא קטגוריה</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name_he}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value={NEW_CATEGORY_VALUE}>+ הוסף קטגוריה</option>
      </select>

      {saveState === 'saving' && (
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
          aria-label="שומר..."
        />
      )}
      {saveState === 'success' && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-green-600"
          aria-label="נשמר"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {saveState === 'error' && (
        <span className="text-xs text-red-600">שגיאה</span>
      )}
    </div>
  )
}
