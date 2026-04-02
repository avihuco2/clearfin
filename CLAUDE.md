# ClearFin — Claude Code Project Guide

## Project Overview

ClearFin is a multi-tenant Israeli home financial management webapp. It scrapes bank and credit card transactions from Israeli financial institutions using `israeli-bank-scrapers`, categorizes them with Claude AI, and presents them in a Hebrew-first RTL dashboard.

**Repository:** `avihuco2/clearfin`  
**Dev branch:** `claude/explore-bank-scrapers-q6IVG`

---

## Architecture Summary

```
Browser (Next.js / Vercel TLV1)
  └── API Routes (Next.js Route Handlers)
        ├── Supabase eu-central-1  — Postgres + RLS + Google OAuth + Realtime
        ├── Upstash Redis (BullMQ) — scrape job queue
        └── Anthropic API (Haiku)  — transaction categorization

Railway Docker container
  └── BullMQ scraper worker
        └── israeli-bank-scrapers (Puppeteer + Chromium)
```

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), shadcn/ui, Tailwind CSS (RTL logical props) |
| Auth | Supabase Auth + Google OAuth |
| Database | Supabase Postgres with Row Level Security |
| Queue | Upstash Redis + BullMQ |
| Scraper Worker | Node.js 22 + Chromium on Railway |
| AI | Claude 3 Haiku via Anthropic API |
| Deployment | Vercel (frontend) + Railway (worker) + Supabase (db) |

---

## Monorepo Structure

```
clearfin/
├── CLAUDE.md                        # This file
├── .claude/
│   ├── agents/
│   │   ├── orchestrator.md          # Orchestrator agent
│   │   ├── security.md              # Security & vulnerability agent
│   │   ├── frontend.md              # UI / RTL / Hebrew agent
│   │   ├── backend.md               # API routes / business logic agent
│   │   ├── database.md              # Schema / migrations / RLS agent
│   │   └── scraper-worker.md        # Bank scraping worker agent
│   └── commands/
│       ├── orchestrate.md           # /orchestrate — coordinate all agents
│       ├── security-scan.md         # /security-scan — run security audit
│       ├── categorize.md            # /categorize — trigger AI categorization
│       ├── scrape.md                # /scrape — trigger manual bank scrape
│       └── migrate.md               # /migrate — run DB migration
├── apps/
│   ├── web/                         # Next.js frontend + API routes
│   └── worker/                      # BullMQ scraper worker (Railway)
├── packages/
│   ├── db/                          # Supabase types + RLS migrations
│   └── crypto/                      # AES-256-GCM credential encryption
└── supabase/
    └── migrations/                  # SQL migration files
```

---

## Agents

### Orchestrator Agent — `.claude/agents/orchestrator.md`
Coordinates all specialist agents. Start here for any multi-component task.
Invoke: use the `/orchestrate` slash command or spawn directly via the Agent tool.

### Security Agent — `.claude/agents/security.md`
Scans for vulnerabilities: credential leaks, SQL injection, XSS, insecure crypto, RLS bypass, OWASP Top 10.
Invoke: `/security-scan` or on every PR before merge.

### Frontend Agent — `.claude/agents/frontend.md`
Owns Next.js App Router, shadcn/ui, Hebrew RTL, Intl formatting, Recharts, Realtime subscriptions.

### Backend Agent — `.claude/agents/backend.md`
Owns Next.js Route Handlers, Supabase client, BullMQ job enqueuing, credential encrypt/decrypt bridge.

### Database Agent — `.claude/agents/database.md`
Owns Supabase migrations, RLS policies, indexes, and schema evolution.

### Scraper Worker Agent — `.claude/agents/scraper-worker.md`
Owns the Railway Docker container, BullMQ consumer, `israeli-bank-scrapers` integration, OTP flow.

---

## Skills

### Built-in Claude Code Skills in Use

| Skill | Purpose in ClearFin |
|---|---|
| `schedule` | Cron every 6h — enqueue scrape jobs for all active bank accounts |
| `claude-api` | Batch-categorize transactions with Claude Haiku post-scrape |
| `loop` | Poll for OTP submission during 2FA bank login (5s interval, 120s timeout) |
| `session-start-hook` | On new Google login: create `profiles` row + seed Hebrew categories |
| `update-config` | Let users change scrape frequency from Settings UI without redeployment |

### Downloaded Skills (`.claude/skills/`)

| Skill | Source | Purpose in ClearFin |
|---|---|---|
| `webapp-testing` | `anthropics/skills` | Playwright tests for the Next.js frontend and API routes |
| `xlsx` | `anthropics/skills` | Export transactions to `.xlsx` for offline analysis and tax filing |

### Custom Slash Commands

| Command | File | Description |
|---|---|---|
| `/orchestrate` | `.claude/commands/orchestrate.md` | Coordinate multi-agent tasks end-to-end |
| `/security-scan` | `.claude/commands/security-scan.md` | Full vulnerability audit |
| `/api` | `.claude/commands/api.md` | Scaffold/audit Next.js Route Handlers; integrates `claude-api` skill |
| `/categorize` | `.claude/commands/categorize.md` | Trigger AI categorization for uncategorized txns |
| `/scrape` | `.claude/commands/scrape.md` | Trigger manual bank scrape for an account |
| `/migrate` | `.claude/commands/migrate.md` | Apply pending Supabase migrations |

---

## Multi-Tenancy Rules

- All tables have `user_id uuid references auth.users(id)` and RLS enabled
- Policies use `auth.uid() = user_id` — enforced at Postgres engine level
- The `service_role` key **must never** reach the browser client
- All client queries use the `anon` key through Supabase JS client
- Credentials are encrypted with AES-256-GCM before DB insert; key lives in env vars only

---

## Hebrew / RTL Rules (Non-Negotiable)

- Root layout: `<html lang="he" dir="rtl">`
- Tailwind: use logical properties ONLY — `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `border-e`
  - NEVER use: `ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`, `border-l`, `border-r`
- Font: `Heebo` or `Assistant` via `next/font/google`
- Currency: `new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`
- Dates: `new Intl.DateTimeFormat('he-IL')` 
- Wrap app in `<DirectionProvider dir="rtl">` from `@radix-ui/react-direction`
- Mixed-content inputs: `dir="auto"` (not `dir="rtl"`)

---

## Security Requirements

- Bank credentials: AES-256-GCM encrypted, IV and tag stored separately, key in env
- No credentials in logs, errors, or API responses
- All Supabase queries go through RLS; never use `service_role` on client
- Dependency audit: run `npm audit` before every deployment
- Security agent (`/security-scan`) must pass before any production deploy

---

## Development Phases

| Phase | Focus |
|---|---|
| 1 | Auth + RTL skeleton (Google login → blank Hebrew dashboard) |
| 2 | Bank connection + scraping (connect account, handle OTP, see raw transactions) |
| 3 | Dashboard + AI categorization (charts, Hebrew categories, filters) |
| 4 | Scheduled scraping + budget tracking + production hardening |

---

## Key Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, never expose to client

# Encryption (AES-256-GCM key, 32 bytes hex)
CREDENTIALS_ENCRYPTION_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Railway (worker only)
WORKER_CONCURRENCY=3
```

---

## Running Locally

```bash
# Install dependencies
npm install

# Start web app
cd apps/web && npm run dev

# Start worker (requires Chromium)
cd apps/worker && npm run dev

# Apply DB migrations
npx supabase db push
```
