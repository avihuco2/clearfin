import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/** Browser-side Supabase client using the anon key. Safe to use in Client Components. */
export function createBrowserClient() {
  return createClientComponentClient()
}
