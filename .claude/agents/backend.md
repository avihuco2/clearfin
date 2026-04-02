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
3. Verify tenant membership and role before acting
4. Never return raw DB errors to the client

```ts
// app/api/accounts/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { z } from 'zod'

const AddAccountSchema = z.object({
  tenantId: z.string().uuid(),
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

  const { tenantId, companyId, credentials, displayName } = parsed.data

  // Role check — only admins can add bank accounts
  const isAdmin = await checkTenantRole(supabase, tenantId, user.id, 'admin')
  if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Encrypt credentials before storing
  const { ciphertext, iv, tag } = encrypt(credentials, process.env.CREDENTIALS_ENCRYPTION_KEY!)

  const { data, error } = await supabase.from('bank_accounts').insert({
    tenant_id: tenantId,
    added_by: user.id,
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

---

## Tenant Role Helper

Add to `apps/web/app/lib/tenant.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function checkTenantRole(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  requiredRole: 'admin' | 'viewer'
): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .single()

  if (!data) return false
  if (requiredRole === 'viewer') return true          // any member satisfies viewer check
  return data.role === 'admin'                        // strict check for admin
}

export async function requireTenantAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<Response | null> {
  const ok = await checkTenantRole(supabase, tenantId, userId, 'admin')
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
```

---

## API Routes

### Tenant Onboarding & Management

| Method | Route | Role | Description |
|---|---|---|---|
| POST | `/api/tenants` | any authed user | Create a new tenant; caller becomes first admin |
| GET | `/api/tenants` | any authed user | List tenants the current user belongs to |
| GET | `/api/tenants/[id]` | member | Get tenant details |
| PATCH | `/api/tenants/[id]` | admin | Update tenant name/slug |
| DELETE | `/api/tenants/[id]` | admin | Delete tenant and all data |

### Member Management (Admin Only)

| Method | Route | Role | Description |
|---|---|---|---|
| GET | `/api/tenants/[id]/members` | member | List all members and their roles |
| POST | `/api/tenants/[id]/members` | admin | Add existing user by email (creates membership) |
| PATCH | `/api/tenants/[id]/members/[userId]` | admin | Change member role (admin↔viewer) |
| DELETE | `/api/tenants/[id]/members/[userId]` | admin or self | Remove member (or self-leave) |

### Invitations (Admin Only)

| Method | Route | Role | Description |
|---|---|---|---|
| POST | `/api/tenants/[id]/invitations` | admin | Send invitation email to new user |
| GET | `/api/invitations/[token]` | public | Look up invitation by token (for accept flow) |
| POST | `/api/invitations/[token]/accept` | authed user | Accept invitation and join tenant |
| DELETE | `/api/tenants/[id]/invitations/[invId]` | admin | Revoke pending invitation |

### Bank Accounts & Scraping (Admin Only)

| Method | Route | Role | Description |
|---|---|---|---|
| GET | `/api/tenants/[id]/accounts` | member | List tenant's bank accounts |
| POST | `/api/tenants/[id]/accounts` | admin | Add bank/credit card account (encrypts credentials) |
| DELETE | `/api/tenants/[id]/accounts/[accountId]` | admin | Remove account + cancel pending jobs |
| POST | `/api/tenants/[id]/accounts/[accountId]/scrape` | admin | Trigger manual scrape |
| POST | `/api/scrape/otp` | admin | Submit OTP during 2FA scrape |
| GET | `/api/tenants/[id]/jobs/[jobId]` | member | Get scrape job status |

### Transactions & Dashboard (All Members)

| Method | Route | Role | Description |
|---|---|---|---|
| GET | `/api/tenants/[id]/transactions` | member | List transactions with filters |
| PATCH | `/api/tenants/[id]/transactions/[txId]` | member | Update category or notes |
| GET | `/api/tenants/[id]/categories` | member | List system + tenant categories |
| POST | `/api/tenants/[id]/categories` | admin | Create custom category |

---

## Tenant Onboarding Route

```ts
// app/api/tenants/route.ts
const CreateTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
})

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = CreateTenantSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { name, slug } = parsed.data

  // Create tenant + first admin membership atomically
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name, slug, created_by: user.id })
    .select()
    .single()

  if (tenantError?.code === '23505')
    return Response.json({ error: 'Slug already taken' }, { status: 409 })
  if (tenantError) return Response.json({ error: 'Failed to create tenant' }, { status: 500 })

  // Insert the creator as admin
  await supabase.from('tenant_memberships').insert({
    tenant_id: tenant.id,
    user_id: user.id,
    role: 'admin',
    invited_by: user.id,
  })

  return Response.json(tenant, { status: 201 })
}
```

## Invitation Accept Route

```ts
// app/api/invitations/[token]/accept/route.ts
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invitation } = await supabase
    .from('tenant_invitations')
    .select('*')
    .eq('token', params.token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invitation) return Response.json({ error: 'Invalid or expired invitation' }, { status: 404 })

  // Create membership
  const { error: memberError } = await supabase.from('tenant_memberships').insert({
    tenant_id: invitation.tenant_id,
    user_id: user.id,
    role: invitation.role,
    invited_by: invitation.invited_by,
  })

  if (memberError?.code === '23505')
    return Response.json({ error: 'Already a member' }, { status: 409 })

  // Mark invitation accepted
  await supabase.from('tenant_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  return Response.json({ tenantId: invitation.tenant_id })
}
```

---

## Security Rules

- `SUPABASE_SERVICE_ROLE_KEY` — only in Route Handlers, never passed to client
- `CREDENTIALS_ENCRYPTION_KEY` — only in `packages/crypto` and Route Handlers, never logged
- All user inputs go through Zod schemas before use
- **Every tenant-scoped endpoint must call `checkTenantRole` before acting** — do not rely on RLS alone for role enforcement at the API layer
- Admins cannot demote themselves if they are the last admin of a tenant (guard this in `PATCH /members/[userId]`)

### `POST /api/scrape/otp` — Mandatory Ownership Check

```ts
// app/api/scrape/otp/route.ts
const OtpSchema = z.object({
  tenantId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  otpCode: z.string().min(4).max(8),
})

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = OtpSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { tenantId, bankAccountId, otpCode } = parsed.data

  // Must be tenant admin to submit OTP
  const forbidden = await requireTenantAdmin(supabase, tenantId, user.id)
  if (forbidden) return forbidden

  // Verify account belongs to this tenant and is awaiting OTP
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id, scrape_status')
    .eq('id', bankAccountId)
    .eq('tenant_id', tenantId)      // REQUIRED — tenant isolation
    .eq('scrape_status', 'awaiting_otp')
    .single()

  if (!account) return Response.json({ error: 'Not found or not awaiting OTP' }, { status: 404 })

  await redis.set(`otp:${user.id}:${bankAccountId}`, otpCode, { ex: 300 })
  return Response.json({ ok: true })
}
```

### Startup Key Validation

Add to `apps/web/app/lib/crypto.ts`:
```ts
const key = process.env.CREDENTIALS_ENCRYPTION_KEY
if (!key || Buffer.from(key, 'hex').length !== 32) {
  throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex string')
}
```

### Last-Admin Guard

When processing `PATCH /api/tenants/[id]/members/[userId]` (role change) or `DELETE` (remove member):
```ts
// Prevent removing the last admin
if (targetRole !== 'admin' || isRemoval) {
  const { count } = await supabase
    .from('tenant_memberships')
    .select('id', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')

  if ((count ?? 0) <= 1)
    return Response.json({ error: 'Cannot remove the last admin' }, { status: 409 })
}
```

### `POST /api/tenants/[id]/accounts/[accountId]/scrape` — Rate Limiting

```ts
const { data: existing } = await supabase
  .from('scrape_jobs')
  .select('id')
  .eq('bank_account_id', bankAccountId)
  .in('status', ['queued', 'running', 'awaiting_otp'])
  .maybeSingle()
if (existing) return Response.json({ error: 'Scrape already in progress' }, { status: 409 })
```

---

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

export async function enqueueScrapeJob(
  tenantId: string,
  bankAccountId: string,
  triggeredByUser: string,
  triggeredBy: 'manual' | 'schedule'
) {
  const job = await scrapeQueue.add('scrape', { tenantId, bankAccountId, triggeredByUser, triggeredBy }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  })
  return job.id
}
```

---

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
