'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ScrapeAllButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [enqueued, setEnqueued] = useState(0)
  const router = useRouter()

  async function handleClick() {
    setStatus('loading')
    try {
      const res = await fetch('/api/scrape/all', { method: 'POST' })
      const body = await res.json() as { enqueued?: number; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'שגיאה')
      setEnqueued(body.enqueued ?? 0)
      setStatus('done')
      router.refresh()
      setTimeout(() => setStatus('idle'), 4000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] shadow-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
    >
      {status === 'loading' && (
        <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {status === 'idle' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      )}
      {status === 'loading' && 'מושך עסקאות...'}
      {status === 'idle'    && 'משוך את כל העסקאות'}
      {status === 'done'    && `נשלחו ${enqueued} משימות`}
      {status === 'error'   && 'שגיאה, נסה שוב'}
    </button>
  )
}
