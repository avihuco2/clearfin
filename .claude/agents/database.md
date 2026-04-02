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

Every table that stores tenant data must have:
```sql
alter table public.<table> enable row level security;

-- Minimum: one SELECT policy scoped to the tenant membership
create policy "tenant members can read <table>"
  on public.<table> for select
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = <table>.tenant_id
        and tm.user_id = auth.uid()
    )
  );
```

Never write:
```sql
using (true)              -- grants access to ALL rows for ALL tenants
with check (true)         -- allows any user to insert/update any row
```

---

## Multi-Tenancy Model

ClearFin uses a **tenant-per-household** model:
- A **tenant** represents a household or organisation
- Each user can belong to multiple tenants with a role: `admin` or `viewer`
- **admin** — can manage bank accounts, credit cards, scraping, and invite/remove members
- **viewer** — read-only access to transactions and dashboard; cannot manage accounts or members
- The user who creates a tenant is automatically its first `admin`
- Credentials (`encrypted_credentials`) are always scoped to the tenant, added by admins only

---

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

### tenants
```sql
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,             -- URL-safe identifier, e.g. "cohen-family"
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);
alter table public.tenants enable row level security;

-- Any member of the tenant can read it
create policy "tenant members can read tenant"
  on public.tenants for select
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenants.id
        and tm.user_id = auth.uid()
    )
  );

-- Only the tenant creator (first admin) can update tenant metadata
create policy "tenant admin can update tenant"
  on public.tenants for update
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenants.id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );
```

### tenant_memberships
```sql
create type public.tenant_role as enum ('admin', 'viewer');

create table public.tenant_memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.tenant_role not null default 'viewer',
  invited_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique(tenant_id, user_id)
);
alter table public.tenant_memberships enable row level security;

-- Members can view the membership list for tenants they belong to
create policy "tenant members can read memberships"
  on public.tenant_memberships for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenant_memberships.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Admins can add new members
create policy "tenant admins can insert memberships"
  on public.tenant_memberships for insert
  with check (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenant_memberships.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

-- Admins can update roles; members can remove themselves
create policy "tenant admins can update memberships"
  on public.tenant_memberships for update
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenant_memberships.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create policy "members can delete own membership"
  on public.tenant_memberships for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenant_memberships.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create index on public.tenant_memberships (tenant_id, user_id);
create index on public.tenant_memberships (user_id);
```

### tenant_invitations
```sql
-- Pending invitations sent by email before the invitee has a Supabase account
create table public.tenant_invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  role        public.tenant_role not null default 'viewer',
  invited_by  uuid not null references auth.users(id),
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique(tenant_id, email)
);
alter table public.tenant_invitations enable row level security;

create policy "tenant admins can manage invitations"
  on public.tenant_invitations for all
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenant_invitations.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = tenant_invitations.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

-- Anyone with the token can read the invitation (to accept it)
create policy "anyone can read invitation by token"
  on public.tenant_invitations for select
  using (accepted_at is null and expires_at > now());
```

### categories
```sql
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade, -- null = system category
  name_he     text not null,
  name_en     text,
  icon        text,
  color       text,
  parent_id   uuid references public.categories(id)
);
alter table public.categories enable row level security;

create policy "read system and tenant categories"
  on public.categories for select
  using (
    tenant_id is null
    or exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = categories.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Only admins can create/update/delete tenant categories
create policy "tenant admins can insert categories"
  on public.categories for insert
  with check (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = categories.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create policy "tenant admins can update categories"
  on public.categories for update
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = categories.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create policy "tenant admins can delete categories"
  on public.categories for delete
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = categories.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );
```

### tenant_integrations
Stores external credential-store configurations per tenant (e.g. 1Password service account token).
The service account token is itself encrypted with AES-256-GCM using the server key.

```sql
create type public.integration_provider as enum ('1password');

create table public.tenant_integrations (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  provider              public.integration_provider not null,
  -- Encrypted service-account token (AES-256-GCM, same scheme as bank credentials)
  encrypted_token       text not null,
  token_iv              text not null,
  token_tag             text not null,
  -- Provider-specific config (non-secret); e.g. vault name / vault UUID for 1Password
  config                jsonb not null default '{}',
  enabled               boolean not null default true,
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now(),
  unique(tenant_id, provider)  -- one integration per provider per tenant
);
alter table public.tenant_integrations enable row level security;

-- All tenant members can see which integrations are configured (but not the token)
create policy "tenant members can read integrations"
  on public.tenant_integrations for select
  using (public.is_tenant_member(tenant_id));

-- Only admins can create/update/delete integrations
create policy "tenant admins can manage integrations"
  on public.tenant_integrations for all
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));
```

### bank_accounts
```sql
create type public.credential_store as enum ('local', '1password');

create table public.bank_accounts (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  added_by              uuid not null references auth.users(id),   -- admin who added it
  company_id            text not null,
  account_number        text,
  display_name          text,
  balance               numeric(14,2),
  balance_updated_at    timestamptz,
  -- Credential storage: 'local' (AES-256-GCM in DB) or '1password' (item ref in vault)
  credential_store      public.credential_store not null default 'local',
  -- Used when credential_store = 'local'
  encrypted_credentials text,
  credentials_iv        text,
  credentials_tag       text,
  -- Used when credential_store = '1password': the 1Password item UUID
  external_credential_ref text,
  last_scraped_at       timestamptz,
  scrape_status         text not null default 'idle',  -- idle|queued|running|awaiting_otp|error
  scrape_error          text,
  created_at            timestamptz not null default now(),
  unique(tenant_id, company_id, account_number),
  -- Enforce: local store must have encrypted fields; 1password store must have ref
  constraint local_credentials_required check (
    credential_store != 'local'
    or (encrypted_credentials is not null and credentials_iv is not null and credentials_tag is not null)
  ),
  constraint external_ref_required check (
    credential_store != '1password'
    or external_credential_ref is not null
  )
);
alter table public.bank_accounts enable row level security;

-- All tenant members can read accounts
create policy "tenant members can read bank_accounts"
  on public.bank_accounts for select
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = bank_accounts.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Only admins can add/update/delete bank accounts
create policy "tenant admins can insert bank_accounts"
  on public.bank_accounts for insert
  with check (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = bank_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create policy "tenant admins can update bank_accounts"
  on public.bank_accounts for update
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = bank_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create policy "tenant admins can delete bank_accounts"
  on public.bank_accounts for delete
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = bank_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );
```

### transactions
```sql
create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
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

-- All tenant members can read and update transactions (e.g. add notes, change category)
create policy "tenant members can read transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = transactions.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Viewers can update notes/category; admins can do everything
create policy "tenant members can update transactions"
  on public.transactions for update
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = transactions.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Only the worker (service_role) inserts transactions; no direct user insert needed
-- Admin delete for correction scenarios:
create policy "tenant admins can delete transactions"
  on public.transactions for delete
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = transactions.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

-- Performance indexes for dashboard queries
create index on public.transactions (tenant_id, date desc);
create index on public.transactions (tenant_id, category_id);
create index on public.transactions (bank_account_id, date desc);
create index on public.transactions (tenant_id, status) where status = 'pending';
```

### scrape_jobs
```sql
create table public.scrape_jobs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  bank_account_id     uuid references public.bank_accounts(id) on delete cascade,
  triggered_by        text not null,   -- 'schedule' | 'manual'
  triggered_by_user   uuid references auth.users(id),
  status              text not null default 'queued',  -- queued|running|done|error
  transactions_added  int default 0,
  error_message       text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now()
);
alter table public.scrape_jobs enable row level security;

-- All members can see job status (so viewers see when data was last refreshed)
create policy "tenant members can read scrape_jobs"
  on public.scrape_jobs for select
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = scrape_jobs.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Only admins can trigger jobs
create policy "tenant admins can insert scrape_jobs"
  on public.scrape_jobs for insert
  with check (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = scrape_jobs.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );

create policy "tenant admins can update scrape_jobs"
  on public.scrape_jobs for update
  using (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = scrape_jobs.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'admin'
    )
  );
```

---

## Helper Function: is_tenant_admin

Define a reusable helper to simplify RLS policies:
```sql
create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
      and role = 'admin'
  )
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
  )
$$;
```

---

## Hebrew Category Seeds

Run after migration to populate system categories:
```sql
insert into public.categories (id, tenant_id, name_he, name_en, icon, color) values
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

---

## Migration File Naming

```
supabase/migrations/
  20240101000000_initial_schema.sql         # profiles, tenants, memberships, invitations
  20240101000001_tenant_data_tables.sql     # categories, bank_accounts, transactions, scrape_jobs
  20240101000002_helper_functions.sql       # is_tenant_admin, is_tenant_member
  20240101000003_seed_categories.sql        # Hebrew system categories
  20240101000004_tenant_integrations.sql    # tenant_integrations, credential_store enum on bank_accounts
  20240101000005_<feature>.sql              # future migrations
```

## Workflow

1. Write migration SQL with full `create table`, `enable row level security`, policies, and indexes
2. Test locally: `npx supabase db reset`
3. Generate updated types: `npx supabase gen types typescript --local > packages/db/types.ts`
4. Commit migration file and updated types together
