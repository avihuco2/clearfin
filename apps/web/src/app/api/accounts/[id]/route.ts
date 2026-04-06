import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { encrypt } from '@clearfin/crypto'
import { requireUser } from '@/lib/auth-session'
import { logCredentialAccess } from '@/lib/audit-log'

const ParamsSchema = z.object({ id: z.string().uuid() })

const UpdateSchema = z.object({
  credentials: z.record(z.string()).optional(),
  displayName: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const body = await req.json()
  const bodyParsed = UpdateSchema.safeParse(body)
  if (!bodyParsed.success) return Response.json({ error: bodyParsed.error.flatten() }, { status: 400 })

  const { id } = parsed.data

  // Ownership check
  const account = (await sql`
    SELECT id FROM bank_accounts WHERE id = ${id} AND user_id = ${user.id}
  `)[0]
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  try {
    if (bodyParsed.data.displayName !== undefined && !bodyParsed.data.credentials) {
      await sql`
        UPDATE bank_accounts
        SET display_name = ${bodyParsed.data.displayName}
        WHERE id = ${id}
      `
    } else if (bodyParsed.data.credentials) {
      const { ciphertext, iv, tag } = encrypt(
        bodyParsed.data.credentials,
        process.env.CREDENTIALS_ENCRYPTION_KEY!,
      )
      await sql`
        UPDATE bank_accounts
        SET
          encrypted_credentials = ${ciphertext},
          credentials_iv        = ${iv},
          credentials_tag       = ${tag},
          scrape_status         = 'idle',
          scrape_error          = NULL
          ${bodyParsed.data.displayName !== undefined
            ? sql`, display_name = ${bodyParsed.data.displayName}`
            : sql``}
        WHERE id = ${id}
      `
      void logCredentialAccess({
        userId: user.id,
        bankAccountId: id,
        action: 'updated',
        triggeredBy: 'user',
      })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Failed to update account' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return Response.json({ error: 'Invalid account id' }, { status: 400 })

  const { id } = parsed.data

  // Ownership check
  const account = (await sql`
    SELECT id FROM bank_accounts WHERE id = ${id} AND user_id = ${user.id}
  `)[0]
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  try {
    await sql`DELETE FROM bank_accounts WHERE id = ${id}`

    void logCredentialAccess({
      userId: user.id,
      bankAccountId: id,
      action: 'deleted',
      triggeredBy: 'user',
    })

    return new Response(null, { status: 204 })
  } catch {
    return Response.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
