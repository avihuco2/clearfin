---
name: api
description: Scaffold or manage a Next.js Route Handler for ClearFin. Generates typed, session-validated, Zod-validated route files that follow the backend agent's patterns. Delegates to the claude-api skill for any Anthropic SDK integration needs.
---

# /api — Backend API Route Manager

**Usage:**
```
/api <route-path> [--method GET|POST|PATCH|DELETE] [--description <text>]
/api list
/api audit
```

## What This Skill Does

| Subcommand | Behaviour |
|---|---|
| `/api <route>` | Scaffold a complete Route Handler at `apps/web/src/app/api/<route>/route.ts` |
| `/api list` | Print all existing Route Handlers with their methods and ownership status |
| `/api audit` | Check every Route Handler for missing session guard, missing Zod validation, or raw DB error leaks |

---

## Scaffolding Protocol

When generating a new Route Handler, follow these steps in order:

### 1 — Determine the HTTP methods
Read the `--method` flag. If omitted, infer from the route path:
- `GET` for read-only list or detail routes
- `POST` for create / trigger routes
- `PATCH` for partial update routes
- `DELETE` for removal routes

### 2 — Generate the Zod input schema
- For `GET`: validate `searchParams` using `z.object({ ... })`
- For `POST`/`PATCH`: validate `req.json()` using `z.object({ ... })`
- For `DELETE`: validate `params` (route segment) using `z.string().uuid()`

### 3 — Emit the Route Handler

Every generated file **must** include all five guards in this exact order:

```ts
// apps/web/src/app/api/<route>/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'

// --- 1. Input schema ---
const InputSchema = z.object({ /* ... */ })

export async function POST(req: NextRequest) {
  // --- 2. Session guard ---
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // --- 3. Input validation ---
  const body = await req.json()
  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  // --- 4. Ownership check (for resource routes) ---
  // const { data: resource } = await supabase.from('...').select('id').eq('id', id).eq('user_id', user.id).single()
  // if (!resource) return Response.json({ error: 'Not found' }, { status: 404 })

  // --- 5. Business logic ---
  // ...

  // --- 6. Never return raw DB errors ---
  // if (error) return Response.json({ error: 'Internal error' }, { status: 500 })
}
```

### 4 — Register the route in `apps/web/src/lib/api-routes.ts`

Maintain a typed manifest so the frontend and tests always have a single source of truth:

```ts
export const API_ROUTES = {
  accounts: {
    list:   '/api/accounts',
    create: '/api/accounts',
    delete: (id: string) => `/api/accounts/${id}`,
  },
  scrape: {
    trigger: '/api/scrape/trigger',
    otp:     '/api/scrape/otp',
    status:  (jobId: string) => `/api/scrape/${jobId}`,
  },
  transactions: {
    list:   '/api/transactions',
    update: (id: string) => `/api/transactions/${id}`,
  },
  categories: {
    list:   '/api/categories',
    create: '/api/categories',
  },
} as const
```

---

## Claude API Integration (via `claude-api` skill)

When a route needs to call the Anthropic API (e.g., categorization, summarization), invoke the built-in `claude-api` skill:

```ts
// apps/web/src/app/api/categorize/route.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  // ... session + Zod guards first ...

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  // Parse response ...
}
```

Rules for Anthropic API calls from Route Handlers:
- Always use `claude-haiku-4-5-20251001` unless the task explicitly requires a larger model
- `ANTHROPIC_API_KEY` is server-only — never expose to client
- Batch calls: group up to 50 transaction descriptions per request to minimise cost
- If the Anthropic call fails, return `503` with a generic message; never surface the SDK error to the client

---

## Audit Rules (`/api audit`)

Flag any Route Handler that violates:

| Rule | Check |
|---|---|
| Missing session guard | No `supabase.auth.getUser()` before any DB operation |
| Missing Zod validation | Body/params used without `.safeParse()` |
| Raw DB error leak | `error.message` or `error.details` returned directly |
| `service_role` in response | Key value appears in any `Response.json(...)` call |
| Missing ownership check | Resource fetched without `.eq('user_id', user.id)` |
| Edge runtime | `export const runtime = 'edge'` — all routes must be Node.js |

---

## Security Checklist (run before every new route lands on main)

- [ ] Session guard present and returns `401` before any logic
- [ ] All inputs validated with Zod; raw body never used directly
- [ ] Ownership check on all resource routes
- [ ] No raw Supabase error messages in responses
- [ ] `CREDENTIALS_ENCRYPTION_KEY` not referenced outside `packages/crypto`
- [ ] Anthropic API key not logged or returned
- [ ] Route uses `Node.js` runtime (not Edge)
- [ ] Run `/security-scan` if touching auth, credentials, or schema

---

## When to Use This Skill vs. the Backend Agent

| Use `/api` when... | Use the `backend` agent when... |
|---|---|
| Scaffolding a new route from scratch | Debugging complex business logic in an existing route |
| Listing or auditing all existing routes | Refactoring the BullMQ queue setup |
| Adding Claude API integration to a route | Overhauling the credential encryption bridge |
| Quick session/Zod checklist before commit | Any cross-cutting backend concern |
