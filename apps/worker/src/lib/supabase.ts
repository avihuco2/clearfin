import { createClient } from '@supabase/supabase-js'

if (!process.env['SUPABASE_URL']) throw new Error('Missing env: SUPABASE_URL')
if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')

/**
 * Admin Supabase client using the service role key.
 * This client bypasses RLS — always scope queries with user_id explicitly.
 * Must never be imported by any browser-side code.
 */
export const supabase = createClient(
  process.env['SUPABASE_URL'],
  process.env['SUPABASE_SERVICE_ROLE_KEY'],
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)
