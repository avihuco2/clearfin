import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

// Edge-compatible config — no Node.js built-ins (no pg, no crypto).
// Used by middleware for JWT verification. Spread into auth.ts for the full config.
export const authConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // On first sign-in, user.id is the DB UUID from the pg adapter
      if (user?.id) token.id = user.id
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      return session
    },
  },
} satisfies NextAuthConfig
