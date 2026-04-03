'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

const navItems = [
  {
    href: '/',
    label: 'דשבורד',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: '/accounts',
    label: 'חשבונות',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
  },
  {
    href: '/transactions',
    label: 'עסקאות',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h12" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'הגדרות',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
]

interface SidebarNavProps {
  displayName: string
}

export function SidebarNav({ displayName }: SidebarNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex h-full flex-col" aria-label="ניווט ראשי">

      {/* Logo */}
      <div className="px-5 py-6">
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-black" style={{ color: 'var(--color-primary)', letterSpacing: '-0.03em' }}>Clear</span>
          <span className="text-xl font-black text-[var(--color-foreground)]" style={{ letterSpacing: '-0.03em' }}>Fin</span>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--color-sidebar-muted)]">ניהול פיננסי חכם</p>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ background: 'var(--color-border)' }} />

      {/* Nav items */}
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-3 pt-4" role="list">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150"
                style={isActive ? {
                  background: 'var(--color-primary-dim)',
                  color: 'var(--color-primary)',
                  border: '1px solid rgba(6,182,212,0.15)',
                } : {
                  color: 'var(--color-foreground-muted)',
                  border: '1px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = ''
                }}
              >
                <span className="shrink-0">{item.icon}</span>
                {item.label}
                {isActive && (
                  <span className="ms-auto h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ background: 'var(--color-border)' }} />

      {/* User footer */}
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2.5 rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--color-primary-dim)', color: 'var(--color-primary)' }}>
            {displayName.charAt(0)}
          </div>
          <p className="truncate text-xs text-[var(--color-foreground-muted)]">{displayName}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150 disabled:opacity-50"
          style={{ color: 'var(--color-foreground-dim)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-danger)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-foreground-dim)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
          {signingOut ? 'מתנתק...' : 'התנתק'}
        </button>
      </div>
    </nav>
  )
}
