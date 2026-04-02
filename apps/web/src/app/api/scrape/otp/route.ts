import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Redis } from '@upstash/redis'
import { createServerClient } from '@/lib/supabase/server'

// Lazy init — avoids connection attempt during Next.js build
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
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = OtpSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId, otp } = parsed.data

  // Ownership check + verify account is actually awaiting OTP
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id, scrape_status')
    .eq('id', bankAccountId)
    .eq('user_id', user.id)
    .single()
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })
  if (account.scrape_status !== 'awaiting_otp') {
    return Response.json({ error: 'Account is not awaiting OTP' }, { status: 409 })
  }

  // Write OTP to Redis — worker polls this key
  await getRedis().set(`otp:${bankAccountId}`, otp, { ex: 130 })

  return Response.json({ ok: true })
}
