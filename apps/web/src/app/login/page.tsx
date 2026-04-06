import { signIn } from '@/lib/auth'

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      {/* Decorative rings */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full border border-[rgba(6,182,212,0.06)] absolute" />
        <div className="h-[400px] w-[400px] rounded-full border border-[rgba(6,182,212,0.08)] absolute" />
        <div className="h-[200px] w-[200px] rounded-full border border-[rgba(6,182,212,0.1)] absolute" />
      </div>

      {/* Glow behind card */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-[rgba(6,182,212,0.08)] blur-3xl" />

      {/* Card */}
      <div className="glass-strong relative w-full max-w-sm rounded-2xl p-8 animate-fade-up" style={{ borderRadius: '24px' }}>

        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mb-1 inline-flex items-center gap-2">
            <span
              className="text-4xl font-black tracking-tight"
              style={{ color: 'var(--color-primary)', letterSpacing: '-0.03em' }}
            >
              Clear
            </span>
            <span className="text-4xl font-black tracking-tight text-[var(--color-foreground)]" style={{ letterSpacing: '-0.03em' }}>
              Fin
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--color-foreground-muted)]">ניהול פיננסי חכם לבית הישראלי</p>
        </div>

        {/* Feature pills */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {['סנכרון אוטומטי', 'סיווג AI', 'כל הבנקים'].map((f) => (
            <span key={f} className="rounded-full px-3 py-1 text-xs font-medium" style={{
              background: 'var(--color-primary-dim)',
              color: 'var(--color-primary)',
              border: '1px solid rgba(6,182,212,0.2)',
            }}>
              {f}
            </span>
          ))}
        </div>

        {/* Google sign-in form — Server Action */}
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/' })
          }}
        >
          <button
            type="submit"
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none"
            style={{
              background: 'var(--color-primary)',
              color: '#000',
              boxShadow: '0 0 20px rgba(6,182,212,0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#1a1a1a" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#1a1a1a" opacity=".7"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#1a1a1a" opacity=".5"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#1a1a1a" opacity=".3"/>
            </svg>
            כניסה עם Google
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--color-foreground-dim)]">
          בכניסה אתה מסכים לתנאי השימוש ומדיניות הפרטיות
        </p>
      </div>
    </main>
  )
}
