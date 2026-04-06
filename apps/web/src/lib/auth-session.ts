import { auth } from '@/lib/auth'

export async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return { id: session.user.id, email: session.user.email ?? '' }
}
