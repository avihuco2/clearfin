'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)
    const supabase = createBrowserClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (oauthError) {
      setError('שגיאה בהתחברות. נסה שוב.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-background)] p-4">
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-sm"
        role="main"
      >
        {/* Logo / App name */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="text-3xl font-bold text-[var(--color-primary)]">ClearFin</span>
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">ניהול פיננסי חכם</p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 border border-red-200"
          >
            {error}
          </div>
        )}

        {/* Sign-in button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-foreground)] shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          ) : (
            /* Google G icon */
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
                fill="#EA4335"
              />
            </svg>
          )}
          {loading ? 'מתחבר...' : 'התחבר עם Google'}
        </button>

        <p className="mt-6 text-center text-xs text-[var(--color-muted-foreground)]">
          בהתחברות אתה מסכים לתנאי השימוש ומדיניות הפרטיות
        </p>
      </div>
    </main>
  )
}
