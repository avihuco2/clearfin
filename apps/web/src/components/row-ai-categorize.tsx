'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface RowAiCategorizeProps {
  transactionId: string
  onCategorized?: (categoryId: string) => void
}

type ButtonState = 'idle' | 'loading' | 'error'

export function RowAiCategorize({ transactionId, onCategorized }: RowAiCategorizeProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const router = useRouter()

  async function handleClick() {
    if (state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      })
      if (!res.ok) throw new Error('categorize failed')
      const data = (await res.json()) as { categoryId?: string }
      if (data.categoryId) {
        onCategorized?.(data.categoryId)
      }
      setState('idle')
      router.refresh()
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      aria-label="סווג אוטומטית עם בינה מלאכותית"
      title="סווג עם AI"
      className={[
        'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors disabled:opacity-50',
        state === 'error'
          ? 'border-red-300 bg-red-50 text-red-600'
          : 'border-[var(--color-border)] bg-[var(--color-muted)]/60 text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]',
      ].join(' ')}
    >
      {state === 'loading' ? (
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
          aria-hidden="true"
        />
      ) : state === 'error' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      )}
      <span>{state === 'loading' ? 'מסווג...' : state === 'error' ? 'שגיאה' : 'AI'}</span>
    </button>
  )
}
