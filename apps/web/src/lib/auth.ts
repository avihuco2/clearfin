import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from 'pg'
import { authConfig } from './auth.config'

// Server-only — imports pg which requires Node.js built-ins (net, tls).
// Do NOT import this file in middleware.ts; use auth.config.ts there instead.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool),
  session: { strategy: 'jwt' },
  events: {
    async signIn({ user }) {
      // Create profile row if first sign-in (belt-and-suspenders alongside DB trigger)
      if (user.id) {
        const { sql } = await import('@clearfin/db/client')
        await sql`INSERT INTO profiles (id) VALUES (${user.id}) ON CONFLICT DO NOTHING`
      }
    },
  },
})
