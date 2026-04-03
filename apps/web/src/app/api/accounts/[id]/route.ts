import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { encrypt } from '@clearfin/crypto'

const ParamsSchema = z.object({ id: z.string().uuid() })

const UpdateSchema = z.object({
  credentials: z.record(z.string()).optional(),
  displayName: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const body = await req.json()
  const bodyParsed = UpdateSchema.safeParse(body)
  if (!bodyParsed.success) return Response.json({ error: bodyParsed.error.flatten() }, { status: 400 })

  const { id } = parsed.data

  // Ownership check
  const { data: account } = await supabase
    .from('bank_accounts').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}

  if (bodyParsed.data.displayName !== undefined) {
    updates.display_name = bodyParsed.data.displayName
  }

  if (bodyParsed.data.credentials) {
    const { ciphertext, iv, tag } = encrypt(
      bodyParsed.data.credentials,
      process.env.CREDENTIALS_ENCRYPTION_KEY!,
    )
    updates.encrypted_credentials = ciphertext
    updates.credentials_iv = iv
    updates.credentials_tag = tag
    // Reset status so next scrape retries with new credentials
    updates.scrape_status = 'idle'
    updates.scrape_error = null
  }

  const { error } = await supabase.from('bank_accounts').update(updates).eq('id', id)
  if (error) return Response.json({ error: 'Failed to update account' }, { status: 500 })

  return Response.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const { id } = parsed.data

  const { data: account } = await supabase
    .from('bank_accounts').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
  if (error) return Response.json({ error: 'Failed to delete account' }, { status: 500 })

  return new Response(null, { status: 204 })
}
