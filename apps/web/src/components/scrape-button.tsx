'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { API_ROUTES } from '@/lib/api-routes'

type ScrapeStatus = 'idle' | 'running' | 'done' | 'error' | 'awaiting_otp'

interface ScrapeButtonProps {
  accountId: string
  status: ScrapeStatus
}

export function ScrapeButton({ accountId, status }: ScrapeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  const isDisabled = loading || status === 'running' || status === 'awaiting_otp'

  async function handleScrape() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(API_ROUTES.scrape.trigger, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (!res.ok) {
        setErrorMsg('שגיאה בהפעלת הסריקה')
        return
      }
      router.refresh()
    } catch {
      setErrorMsg('שגיאת רשת. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {errorMsg && (
        <p className="mb-1 text-xs text-red-600">{errorMsg}</p>
      )}
      <button
        type="button"
        onClick={handleScrape}
        disabled={isDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="הפעל סריקה"
      >
        {loading || status === 'running' ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        )}
        {status === 'running' ? 'סורק...' : 'סרוק'}
      </button>
    </div>
  )
}
