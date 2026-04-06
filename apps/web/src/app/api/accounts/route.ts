import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from '@clearfin/db/client'
import { encrypt } from '@clearfin/crypto'
import { requireUser } from '@/lib/auth-session'
import { logCredentialAccess } from '@/lib/audit-log'

const AddAccountSchema = z.object({
  companyId: z.string().min(1),
  credentials: z.record(z.string()),
  displayName: z.string().optional(),
})

export async function GET() {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await sql`
      SELECT id, company_id, display_name, balance, balance_updated_at, last_scraped_at, scrape_status
      FROM bank_accounts
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  } catch {
    return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = AddAccountSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { companyId, credentials, displayName } = parsed.data
  const { ciphertext, iv, tag } = encrypt(credentials, process.env.CREDENTIALS_ENCRYPTION_KEY!)

  try {
    const rows = await sql`
      INSERT INTO bank_accounts
        (user_id, company_id, display_name, encrypted_credentials, credentials_iv, credentials_tag)
      VALUES
        (${user.id}, ${companyId}, ${displayName ?? null}, ${ciphertext}, ${iv}, ${tag})
      RETURNING id, company_id, display_name, scrape_status, created_at
    `
    const data = rows[0]
    if (!data) return Response.json({ error: 'Failed to save account' }, { status: 500 })

    void logCredentialAccess({
      userId: user.id,
      bankAccountId: data.id as string,
      action: 'stored',
      triggeredBy: 'user',
      metadata: { companyId },
    })

    return Response.json(data, { status: 201 })
  } catch {
    return Response.json({ error: 'Failed to save account' }, { status: 500 })
  }
}
