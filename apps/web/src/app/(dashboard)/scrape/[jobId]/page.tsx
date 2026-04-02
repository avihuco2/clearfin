'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { API_ROUTES } from '@/lib/api-routes'

type JobStatus = 'queued' | 'running' | 'awaiting_otp' | 'done' | 'error'

interface ScrapeJob {
  id: string
  status: JobStatus
  transactions_added: number | null
  error_message: string | null
  bank_account_id?: string
}

const POLL_INTERVAL_MS = 3000

const STATUS_TEXT: Record<string, string> = {
  queued: 'ממתין בתור...',
  running: 'מחובר לבנק, מושך עסקאות...',
  awaiting_otp: 'ממתין לקוד אימות...',
}

export default function ScrapeJobPage() {
  const params = useParams<{ jobId: string }>()
  const router = useRouter()
  const jobId = params.jobId

  const [job, setJob] = useState<ScrapeJob | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // OTP form state
  const [otp, setOtp] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  async function fetchJob() {
    try {
      const res = await fetch(API_ROUTES.scrape.status(jobId), { cache: 'no-store' })
      if (!res.ok) {
        setFetchError('שגיאה בטעינת מצב הסריקה')
        stopPolling()
        return
      }
      const data = (await res.json()) as ScrapeJob
      setJob(data)
      setFetchError(null)

      if (data.status === 'done' || data.status === 'error') {
        stopPolling()
      }
    } catch {
      setFetchError('שגיאת רשת. בודק שוב...')
    }
  }

  useEffect(() => {
    fetchJob()
    intervalRef.current = setInterval(fetchJob, POLL_INTERVAL_MS)
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!job?.bank_account_id) return

    setOtpSubmitting(true)
    setOtpError(null)
    setOtpSent(false)

    try {
      const res = await fetch(API_ROUTES.scrape.otp, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId: job.bank_account_id, otp }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setOtpError(body.error ?? 'שגיאה בשליחת הקוד')
        return
      }
      setOtpSent(true)
      setOtp('')
      // Resume polling (already running)
    } catch {
      setOtpError('שגיאת רשת. נסה שוב.')
    } finally {
      setOtpSubmitting(false)
    }
  }

  // Loading skeleton before first fetch
  if (!job && !fetchError) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
      </div>
    )
  }

  if (fetchError && !job) {
    return (
      <div className="mx-auto max-w-md pt-8">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {fetchError}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-8">
      <h1 className="text-2xl font-bold text-[var(--color-foreground)]">סטטוס סריקה</h1>

      {job && (
        <>
          {/* queued / running */}
          {(job.status === 'queued' || job.status === 'running') && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center shadow-sm">
              <span
                className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent"
                role="status"
                aria-label="טוען"
              />
              <p className="text-base font-medium text-[var(--color-foreground)]">
                {STATUS_TEXT[job.status] ?? 'מעבד...'}
              </p>
            </div>
          )}

          {/* awaiting_otp */}
          {job.status === 'awaiting_otp' && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">
                נדרש אימות דו-שלבי
              </h2>
              <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
                הכנס את הקוד שקיבלת ב-SMS
              </p>

              {otpSent && (
                <p className="mb-3 text-sm font-medium text-green-700">
                  הקוד נשלח. ממתין לאישור...
                </p>
              )}

              {otpError && (
                <p role="alert" className="mb-3 text-sm text-red-600">
                  {otpError}
                </p>
              )}

              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="otp-input"
                    className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
                  >
                    קוד אימות
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{4,10}"
                    maxLength={10}
                    dir="ltr"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                    placeholder="123456"
                    className="w-full rounded-lg border border-[var(--color-input)] bg-white px-4 py-2.5 text-center text-xl font-semibold tracking-widest text-[var(--color-foreground)] placeholder:text-gray-300 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={otpSubmitting || otp.length < 4}
                  className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {otpSubmitting ? 'שולח קוד...' : 'אישור'}
                </button>
              </form>
            </div>
          )}

          {/* done */}
          {job.status === 'done' && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-green-600"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="mb-1 text-lg font-bold text-green-800">הסתיים בהצלחה</h2>
              {job.transactions_added != null && (
                <p className="mb-5 text-sm text-green-700">
                  {job.transactions_added.toLocaleString('he-IL')} עסקאות חדשות נוספו
                </p>
              )}
              <Link
                href="/transactions"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                לצפייה בעסקאות
              </Link>
            </div>
          )}

          {/* error */}
          {job.status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-red-600"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="mb-1 text-lg font-bold text-red-800">הסריקה נכשלה</h2>
              {job.error_message && (
                <p className="mb-5 text-sm text-red-700" dir="auto">
                  {job.error_message}
                </p>
              )}
              <Link
                href="/accounts"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                חזרה לחשבונות
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
