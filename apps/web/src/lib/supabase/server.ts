import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/** Client scoped to the authenticated user's session. Use in Route Handlers. */
export function createServerClient() {
  return createRouteHandlerClient({ cookies })
}

/** Service-role client for admin operations (worker callbacks, migrations).
 *  NEVER import this in client components or pass it through props. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
