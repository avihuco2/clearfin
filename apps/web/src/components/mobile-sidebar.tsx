'use client'

import { useState } from 'react'
import { SidebarNav } from './sidebar-nav'

interface MobileSidebarProps {
  displayName: string
}

export function MobileSidebar({ displayName }: MobileSidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed start-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-sidebar)] text-white shadow-md md:hidden"
        aria-label="פתח תפריט ניווט"
        aria-expanded={open}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel — slides in from the end (right in RTL) */}
      <aside
        className={[
          'fixed inset-y-0 end-0 z-50 w-64 bg-[var(--color-sidebar)] shadow-xl transition-transform duration-300 md:hidden',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        aria-label="תפריט ניווט"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute start-3 top-4 flex h-8 w-8 items-center justify-center rounded-md text-[#94a3b8] hover:text-white"
          aria-label="סגור תפריט"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>
        <SidebarNav displayName={displayName} />
      </aside>
    </>
  )
}
