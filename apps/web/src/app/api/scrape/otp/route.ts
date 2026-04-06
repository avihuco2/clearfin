import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Redis } from '@upstash/redis'
import { sql } from '@clearfin/db/client'
import { requireUser } from '@/lib/auth-session'

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

const OtpSchema = z.object({
  bankAccountId: z.string().uuid(),
  otp: z.string().min(4).max(10),
})

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = OtpSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId, otp } = parsed.data

  const accounts = await sql`
    SELECT id, scrape_status FROM bank_accounts
    WHERE id = ${bankAccountId} AND user_id = ${user.id}
  `
  const account = accounts[0]
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })
  if (account.scrape_status !== 'awaiting_otp') {
    return Response.json({ error: 'Account is not awaiting OTP' }, { status: 409 })
  }

  await getRedis().set(`otp:${bankAccountId}`, otp, { ex: 130 })

  return Response.json({ ok: true })
}
