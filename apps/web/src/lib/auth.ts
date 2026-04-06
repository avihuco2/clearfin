import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
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
