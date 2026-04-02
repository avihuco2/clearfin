import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { MobileSidebar } from '@/components/mobile-sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerComponentClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const displayName =
    session.user.user_metadata?.['full_name'] ??
    session.user.email ??
    'משתמש'

  return (
    <div className="flex min-h-dvh bg-[var(--color-background)]">
      {/* Desktop sidebar — fixed on the end (right) side in RTL */}
      <aside className="fixed inset-y-0 end-0 hidden w-64 bg-[var(--color-sidebar)] md:block">
        <SidebarNav displayName={displayName} />
      </aside>

      {/* Mobile sidebar (drawer) */}
      <MobileSidebar displayName={displayName} />

      {/* Main content — offset by sidebar width on desktop */}
      <main
        className="flex-1 overflow-auto md:me-64"
        id="main-content"
      >
        <div className="mx-auto max-w-5xl p-6 pt-16 md:pt-6">
          {children}
        </div>
      </main>
    </div>
  )
}
