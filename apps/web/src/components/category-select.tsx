'use client'

import { useState } from 'react'
import { API_ROUTES } from '@/lib/api-routes'

export interface CategoryOption {
  id: string
  name_he: string
}

interface CategorySelectProps {
  transactionId: string
  currentCategoryId: string | null
  categories: CategoryOption[]
}

type SaveState = 'idle' | 'saving' | 'success' | 'error'

export function CategorySelect({
  transactionId,
  currentCategoryId,
  categories,
}: CategorySelectProps) {
  const [selected, setSelected] = useState<string | null>(currentCategoryId)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newValue = e.target.value || null
    const previous = selected

    // Optimistic update
    setSelected(newValue)
    setSaveState('saving')

    try {
      const res = await fetch(API_ROUTES.transactions.update(transactionId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: newValue }),
      })

      if (!res.ok) {
        // Revert on failure
        setSelected(previous)
        setSaveState('error')
        setTimeout(() => setSaveState('idle'), 3000)
        return
      }

      setSaveState('success')
      setTimeout(() => setSaveState('idle'), 1500)
    } catch {
      setSelected(previous)
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected ?? ''}
        onChange={handleChange}
        disabled={saveState === 'saving'}
        aria-label="בחר קטגוריה"
        className="max-w-[160px] rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-2 py-1 text-xs text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-60"
      >
        <option value="">ללא קטגוריה</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name_he}
          </option>
        ))}
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
          className="text-green-600"
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
