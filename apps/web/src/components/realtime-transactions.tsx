'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

interface NewTransaction {
  id: string
  description: string
  charged_amount: number
}

function isValidTransaction(value: unknown): value is NewTransaction {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['description'] === 'string' &&
    typeof obj['charged_amount'] === 'number'
  )
}

interface RealtimeTransactionsProps {
  userId: string
}

const POLL_INTERVAL_MS = 15_000

export function RealtimeTransactions({ userId }: RealtimeTransactionsProps) {
  const [newTransactions, setNewTransactions] = useState<NewTransaction[]>([])
  const [dismissed, setDismissed] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeenIdRef = useRef<string | null>(null)

  const visible = !dismissed && newTransactions.length > 0

  // Reset dismiss state whenever the list grows so the banner reappears
  useEffect(() => {
    if (newTransactions.length > 0) {
      setDismissed(false)

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => setDismissed(true), 8000)
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [newTransactions.length])

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions?limit=5', { cache: 'no-store' })
      if (!res.ok) return

      const data: unknown = await res.json()
      if (!Array.isArray(data)) return

      const validated = data.filter(isValidTransaction)
      if (validated.length === 0) return

      const topId = validated[0].id

      // On first poll just record the baseline — don't announce existing transactions
      if (lastSeenIdRef.current === null) {
        lastSeenIdRef.current = topId
        return
      }

      // Nothing new since last poll
      if (topId === lastSeenIdRef.current) return

      // Find which transactions arrived after the last known one
      const knownIndex = validated.findIndex((t) => t.id === lastSeenIdRef.current)
      const incoming = knownIndex === -1 ? validated : validated.slice(0, knownIndex)

      if (incoming.length > 0) {
        lastSeenIdRef.current = topId
        setNewTransactions((prev) => [...incoming, ...prev])
      }
    } catch {
      // Silently ignore network errors — this is best-effort notification only
    }
  }, [])

  useEffect(() => {
    // Run immediately so we capture the baseline before the first interval fires
    void fetchLatest()

    const intervalId = setInterval(() => {
      void fetchLatest()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [fetchLatest, userId])

  if (!visible) return null

  const count = newTransactions.length

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 start-4 end-4 z-50 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-md text-emerald-900"
    >
      <p className="text-sm font-medium">
        <Link
          href="/transactions"
          className="underline underline-offset-2 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          {count} עסקאות חדשות נוספו
        </Link>
      </p>

      <button
        type="button"
        aria-label="סגור התראה"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        ×
      </button>
    </div>
  )
}
