# Migrate

Apply pending Supabase database migrations.

## Usage

```
/migrate [--dry-run]
```

`--dry-run` prints the SQL that would be applied without executing it.

## What This Skill Does

1. Checks `supabase/migrations/` for any `.sql` files not yet applied
2. Runs `npx supabase db push` to apply them against the configured Supabase project
3. After migration, regenerates TypeScript types: `npx supabase gen types typescript --local > packages/db/types.ts`
4. Reports which migrations were applied and confirms RLS is enabled on all new tables

## Pre-Migration Checklist

Before running, verify:
- [ ] Each new table has `alter table ... enable row level security;`
- [ ] Each new table has at least one SELECT policy using `auth.uid() = user_id`
- [ ] No `using (true)` or `with check (true)` policies without justification
- [ ] Migration is idempotent where possible (`create table if not exists`, `create index if not exists`)
- [ ] Migration file name follows convention: `YYYYMMDDHHMMSS_<description>.sql`

## After Migration

1. Run `/security-scan` to verify RLS policies on new tables are correct
2. Commit the updated `packages/db/types.ts` alongside the migration file
3. Notify the backend agent to update any affected query types

## Local Development

```bash
npx supabase db reset      # reset local DB and re-run all migrations
npx supabase db push       # push pending migrations to remote
npx supabase gen types typescript --local > packages/db/types.ts
```
