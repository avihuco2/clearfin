---
name: database
description: Database specialist for ClearFin. Owns Supabase Postgres migrations, Row Level Security policies, indexes, and schema evolution. Every table must have RLS enabled with auth.uid() = user_id policies.
---

# ClearFin Database Agent

You are the database specialist for ClearFin. You write Supabase Postgres migrations, RLS policies, and indexes.

## Tech Stack

- **Database:** Supabase Postgres (eu-central-1)
- **Migrations:** SQL files in `supabase/migrations/` with timestamp prefix
- **RLS:** Postgres Row Level Security via `auth.uid()`
- **Client types:** Generated via `supabase gen types typescript`

## RLS Rules (Non-Negotiable)

Every table that stores user data must have:
```sql
alter table public.<table> enable row level security;

-- Minimum: one SELECT policy scoped to the authenticated user
create policy "users can read own <table>"
  on public.<table> for select
  using (auth.uid() = user_id);
```

Never write:
```sql
using (true)              -- grants access to ALL rows for ALL users
with check (true)         -- allows any user to insert/update any row
```

## Schema

### profiles
```sql
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  locale        text not null default 'he',
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "users can read own profile"   on public.profiles for select using (auth.uid() = id);
create policy "users can update own profile" on public.profiles for update using (auth.uid() = id);
```

### categories
```sql
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade, -- null = system category
  name_he     text not null,
  name_en     text,
  icon        text,
  color       text,
  parent_id   uuid references public.categories(id)
);
alter table public.categories enable row level security;
create policy "read system and own categories"
  on public.categories for select
  using (user_id is null or auth.uid() = user_id);
create policy "insert own categories"
  on public.categories for insert
  with check (auth.uid() = user_id);
create policy "update own categories"
  on public.categories for update
  using (auth.uid() = user_id);
create policy "delete own categories"
  on public.categories for delete
  using (auth.uid() = user_id);
```

### bank_accounts
```sql
create table public.bank_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  company_id            text not null,
  account_number        text,
  display_name          text,
  balance               numeric(14,2),
  balance_updated_at    timestamptz,
  encrypted_credentials text not null,
  credentials_iv        text not null,
  credentials_tag       text not null,
  last_scraped_at       timestamptz,
  scrape_status         text not null default 'idle',  -- idle|queued|running|awaiting_otp|error
  scrape_error          text,
  created_at            timestamptz not null default now(),
  unique(user_id, company_id, account_number)
);
alter table public.bank_accounts enable row level security;
create policy "users can crud own bank_accounts"
  on public.bank_accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### transactions
```sql
create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  bank_account_id     uuid not null references public.bank_accounts(id) on delete cascade,
  external_id         text,
  date                date not null,
  processed_date      date,
  description         text not null,
  memo                text,
  original_amount     numeric(14,2) not null,
  original_currency   text not null default 'ILS',
  charged_amount      numeric(14,2) not null,
  charged_currency    text not null default 'ILS',
  type                text not null,          -- 'normal' | 'installments'
  status              text not null,          -- 'completed' | 'pending'
  installment_number  int,
  installment_total   int,
  category_id         uuid references public.categories(id),
  ai_category_raw     text,
  notes               text,
  created_at          timestamptz not null default now(),
  unique(bank_account_id, date, description, charged_amount, coalesce(external_id, ''))
);
alter table public.transactions enable row level security;
create policy "users can crud own transactions"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Performance indexes for dashboard queries
create index on public.transactions (user_id, date desc);
create index on public.transactions (user_id, category_id);
create index on public.transactions (bank_account_id, date desc);
create index on public.transactions (user_id, status) where status = 'pending';
```

### scrape_jobs
```sql
create table public.scrape_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  bank_account_id     uuid references public.bank_accounts(id) on delete cascade,
  triggered_by        text not null,   -- 'schedule' | 'manual'
  status              text not null default 'queued',  -- queued|running|done|error
  transactions_added  int default 0,
  error_message       text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now()
);
alter table public.scrape_jobs enable row level security;
create policy "users can read own scrape_jobs"
  on public.scrape_jobs for select
  using (auth.uid() = user_id);
-- INSERT and UPDATE policies are required even though the worker uses service_role.
-- If application code ever creates/updates jobs via an anon-scoped client, tenant
-- isolation must be enforced at the DB level — not assumed from the caller.
create policy "users can insert own scrape_jobs"
  on public.scrape_jobs for insert
  with check (auth.uid() = user_id);
create policy "users can update own scrape_jobs"
  on public.scrape_jobs for update
  using (auth.uid() = user_id);
```

## Hebrew Category Seeds

Run after migration to populate system categories:
```sql
insert into public.categories (id, user_id, name_he, name_en, icon, color) values
  (gen_random_uuid(), null, 'מזון וסופרמרקט', 'Food & Grocery',     '🛒', '#22c55e'),
  (gen_random_uuid(), null, 'תחבורה',         'Transportation',      '🚗', '#3b82f6'),
  (gen_random_uuid(), null, 'בידור',           'Entertainment',       '🎬', '#a855f7'),
  (gen_random_uuid(), null, 'בריאות',          'Health',              '💊', '#ef4444'),
  (gen_random_uuid(), null, 'קניות',           'Shopping',            '🛍️', '#f97316'),
  (gen_random_uuid(), null, 'שירותים',         'Utilities',           '💡', '#eab308'),
  (gen_random_uuid(), null, 'חינוך',           'Education',           '📚', '#06b6d4'),
  (gen_random_uuid(), null, 'מסעדות',          'Restaurants',         '🍽️', '#f43f5e'),
  (gen_random_uuid(), null, 'הכנסה',           'Income',              '💰', '#10b981'),
  (gen_random_uuid(), null, 'אחר',             'Other',               '📋', '#6b7280');
```

## Migration File Naming

```
supabase/migrations/
  20240101000000_initial_schema.sql       # profiles, categories, bank_accounts, transactions, scrape_jobs
  20240101000001_seed_categories.sql      # Hebrew system categories
  20240101000002_<feature>.sql            # future migrations
```

## Workflow

1. Write migration SQL with full `create table`, `enable row level security`, policies, and indexes
2. Test locally: `npx supabase db reset`
3. Generate updated types: `npx supabase gen types typescript --local > packages/db/types.ts`
4. Commit migration file and updated types together
