import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  session: { strategy: 'jwt' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // Persist the DB user ID into the JWT on first sign-in
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
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
