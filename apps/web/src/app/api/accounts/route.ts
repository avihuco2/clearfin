import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { encrypt } from '@clearfin/crypto'
import { logCredentialAccess } from '@/lib/audit-log'

const AddAccountSchema = z.object({
  companyId: z.string().min(1),
  credentials: z.record(z.string()),
  displayName: z.string().optional(),
})

export async function GET() {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, company_id, display_name, balance, balance_updated_at, last_scraped_at, scrape_status')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = AddAccountSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { companyId, credentials, displayName } = parsed.data
  const { ciphertext, iv, tag } = encrypt(credentials, process.env.CREDENTIALS_ENCRYPTION_KEY!)

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      user_id: user.id,
      company_id: companyId,
      display_name: displayName,
      encrypted_credentials: ciphertext,
      credentials_iv: iv,
      credentials_tag: tag,
    })
    .select('id, company_id, display_name, scrape_status, created_at')
    .single()

  if (error) return Response.json({ error: 'Failed to save account' }, { status: 500 })

  // Fire-and-forget audit log — never throws
  void logCredentialAccess({
    userId: user.id,
    bankAccountId: data.id,
    action: 'stored',
    triggeredBy: 'user',
    metadata: { companyId },
  })

  return Response.json(data, { status: 201 })
}
