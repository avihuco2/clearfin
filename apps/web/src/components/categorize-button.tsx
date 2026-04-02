'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { API_ROUTES } from '@/lib/api-routes'

interface CategorizeButtonProps {
  uncategorizedCount: number
}

type ButtonState = 'idle' | 'loading' | 'success' | 'error'

export function CategorizeButton({ uncategorizedCount }: CategorizeButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const [categorized, setCategorized] = useState(0)
  const router = useRouter()

  if (uncategorizedCount === 0) return null

  async function handleCategorize() {
    setState('loading')
    try {
      const res = await fetch(API_ROUTES.categorize.trigger, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        setState('error')
        setTimeout(() => setState('idle'), 4000)
        return
      }

      const data = (await res.json()) as { categorized?: number }
      setCategorized(data.categorized ?? 0)
      setState('success')
      router.refresh()
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  if (state === 'success') {
    return (
      <p className="text-sm font-medium text-green-700">
        סווג {categorized.toLocaleString('he-IL')} עסקאות בהצלחה
      </p>
    )
  }

  if (state === 'error') {
    return (
      <p className="text-sm font-medium text-red-600">שגיאה בסיווג, נסה שוב</p>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCategorize}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state === 'loading' ? (
        <>
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden="true"
          />
          מסווג...
        </>
      ) : (
        <>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          סווג {uncategorizedCount.toLocaleString('he-IL')} עסקאות עם AI
        </>
      )}
    </button>
  )
}
