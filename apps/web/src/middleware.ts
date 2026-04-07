import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

// Use edge-safe config (no pg/crypto) so middleware runs in edge runtime.
// auth.ts (with pg adapter) must NOT be imported here.
const { auth } = NextAuth(authConfig)

export { auth as middleware }

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/health).*)'],
}
