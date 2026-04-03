import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { BottomNav } from '@/components/bottom-nav'
import { RealtimeTransactions } from '@/components/realtime-transactions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const displayName =
    session.user.user_metadata?.['full_name'] ??
    session.user.email ??
    'משתמש'

  return (
    <div className="flex min-h-dvh">

      {/* Desktop sidebar — fixed on the end (right) side in RTL */}
      <aside
        className="fixed inset-y-0 end-0 hidden w-60 md:flex md:flex-col"
        style={{
          background: 'rgba(6,10,18,0.72)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderInlineStart: '0.5px solid rgba(255,255,255,0.08)',
        }}
      >
        <SidebarNav displayName={displayName} />
      </aside>

      {/* Mobile bottom tab nav */}
      <BottomNav />

      {/* Realtime banner */}
      <RealtimeTransactions userId={session.user.id} />

      {/* Main content */}
      <main className="flex-1 overflow-auto md:me-60" id="main-content">
        <div className="mx-auto max-w-4xl px-4 py-6 pb-24 md:px-8 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  )
}
