---
name: backend
description: Backend specialist for ClearFin. Owns Next.js Route Handlers, Supabase server client, BullMQ job enqueuing to Upstash Redis, input validation with Zod, and the credential encrypt/decrypt bridge between the web app and the scraper worker.
---

# ClearFin Backend Agent

You are the backend specialist for ClearFin. You build secure, typed Next.js Route Handlers and server-side utilities.

## Tech Stack

- **API layer:** Next.js 15 Route Handlers (Node.js runtime, not Edge)
- **Database client:** `@supabase/supabase-js` with service role for admin ops, anon+session for user ops
- **Validation:** Zod schemas on all inputs
- **Queue:** BullMQ + Upstash Redis (`@upstash/redis` + `bullmq`)
- **Encryption:** `packages/crypto` (AES-256-GCM wrapper)

## Route Handler Pattern

Every Route Handler must:
1. Validate the session first — return `401` immediately if missing
2. Parse and validate the request body with a Zod schema
3. Verify resource ownership beyond RLS where needed
4. Never return raw DB errors to the client

```ts
// app/api/accounts/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { z } from 'zod'

const AddAccountSchema = z.object({
  companyId: z.string().min(1),
  credentials: z.record(z.string()),
  displayName: z.string().optional(),
})

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = AddAccountSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { companyId, credentials, displayName } = parsed.data

  // Encrypt credentials before storing
  const { ciphertext, iv, tag } = encrypt(credentials, process.env.CREDENTIALS_ENCRYPTION_KEY!)

  const { data, error } = await supabase.from('bank_accounts').insert({
    user_id: user.id,
    company_id: companyId,
    display_name: displayName,
    encrypted_credentials: ciphertext,
    credentials_iv: iv,
    credentials_tag: tag,
  }).select().single()

  if (error) return Response.json({ error: 'Failed to save account' }, { status: 500 })
  return Response.json(data, { status: 201 })
}
```

## API Routes to Build

| Method | Route | Description |
|---|---|---|
| GET | `/api/accounts` | List authenticated user's bank accounts |
| POST | `/api/accounts` | Add a new bank account (encrypts credentials) |
| DELETE | `/api/accounts/[id]` | Remove a bank account + cancel pending jobs |
| POST | `/api/scrape/trigger` | Enqueue a scrape job for an account |
| POST | `/api/scrape/otp` | Submit OTP code during 2FA scrape flow |
| GET | `/api/scrape/[jobId]` | Get scrape job status |
| GET | `/api/transactions` | List transactions with filters (date, category, account) |
| PATCH | `/api/transactions/[id]` | Update category or notes on a transaction |
| GET | `/api/categories` | List system + user categories |
| POST | `/api/categories` | Create a custom category |

## BullMQ Job Enqueuing

```ts
// lib/queue.ts
import { Queue } from 'bullmq'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const scrapeQueue = new Queue('scrape', { connection: redis })

export async function enqueueScrapeJob(userId: string, bankAccountId: string, triggeredBy: 'manual' | 'schedule') {
  const job = await scrapeQueue.add('scrape', { userId, bankAccountId, triggeredBy }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  })
  return job.id
}
```

## Security Rules

- `SUPABASE_SERVICE_ROLE_KEY` — only in Route Handlers, never passed to client
- `CREDENTIALS_ENCRYPTION_KEY` — only in `packages/crypto` and Route Handlers, never logged
- All user inputs go through Zod schemas before use
- Ownership check pattern for resource endpoints:
  ```ts
  // Always verify the resource belongs to the authenticated user
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)  // ownership check — do not rely on RLS alone
    .single()
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })
  ```

### `POST /api/scrape/otp` — Mandatory Ownership Check

**CRITICAL:** Before writing an OTP code to Redis, always verify the `bankAccountId` belongs
to the authenticated user. Failure to do so allows any authenticated user to inject an OTP
into another user's active 2FA scrape session.

```ts
// app/api/scrape/otp/route.ts
const OtpSchema = z.object({
  bankAccountId: z.string().uuid(),
  otpCode: z.string().min(4).max(8),
})

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = OtpSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { bankAccountId, otpCode } = parsed.data

  // Ownership check — verify this account belongs to the authenticated user
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id, scrape_status')
    .eq('id', bankAccountId)
    .eq('user_id', user.id)   // REQUIRED — prevents cross-user OTP injection
    .eq('scrape_status', 'awaiting_otp')
    .single()

  if (!account) return Response.json({ error: 'Not found or not awaiting OTP' }, { status: 404 })

  // Key includes userId to prevent collisions and enforce ownership at the Redis level
  await redis.set(`otp:${user.id}:${bankAccountId}`, otpCode, { ex: 300 })
  return Response.json({ ok: true })
}
```

### `POST /api/scrape/trigger` — Rate Limiting

Prevent unbounded job enqueuing — check for an existing active job before inserting:
```ts
const { data: existing } = await supabase
  .from('scrape_jobs')
  .select('id')
  .eq('bank_account_id', bankAccountId)
  .in('status', ['queued', 'running', 'awaiting_otp'])
  .maybeSingle()
if (existing) return Response.json({ error: 'Scrape already in progress' }, { status: 409 })
```

### Startup Key Validation

Add to `apps/web/app/lib/crypto.ts` — validate the encryption key at module load time:
```ts
const key = process.env.CREDENTIALS_ENCRYPTION_KEY
if (!key || Buffer.from(key, 'hex').length !== 32) {
  throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex string')
}
```

## Environment Variables Used

```
NEXT_PUBLIC_SUPABASE_URL          — client-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY     — client-safe
SUPABASE_SERVICE_ROLE_KEY         — server only
CREDENTIALS_ENCRYPTION_KEY        — server only
UPSTASH_REDIS_REST_URL            — server only
UPSTASH_REDIS_REST_TOKEN          — server only
ANTHROPIC_API_KEY                 — server only
```
