'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/client'

interface NewTransaction {
  id: string
  description: string
  charged_amount: number
}

function isValidTransaction(payload: unknown): payload is NewTransaction {
  if (!payload || typeof payload !== 'object') return false
  const obj = payload as Record<string, unknown>
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['description'] === 'string' &&
    typeof obj['charged_amount'] === 'number'
  )
}

interface RealtimeTransactionsProps {
  userId: string
}

export function RealtimeTransactions({ userId }: RealtimeTransactionsProps) {
  const [newTransactions, setNewTransactions] = useState<NewTransaction[]>([])
  const [dismissed, setDismissed] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    const supabase = createBrowserClient()

    const channel = supabase
      .channel('realtime-transactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!isValidTransaction(payload.new)) return
          setNewTransactions((prev) => [payload.new as NewTransaction, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

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
