-- =============================================================================
-- ClearFin — Phase 1 Vanilla PostgreSQL Migration
-- Created: 2026-04-06
-- Replaces all Supabase-specific dependencies:
--   * auth.users → NextAuth users table
--   * Row Level Security removed (handled at application layer)
--   * Supabase triggers removed
--   * Supabase extensions removed (gen_random_uuid() is built-in in PG 13+)
-- Idempotent: uses CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--             ON CONFLICT DO NOTHING for seeds.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- NEXTAUTH @auth/pg-adapter TABLES
-- These must exist before any ClearFin table that references users(id).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT,
  email           TEXT        UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId"          UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT    NOT NULL,
  provider          TEXT    NOT NULL,
  "providerAccountId" TEXT  NOT NULL,
  refresh_token     TEXT,
  access_token      TEXT,
  expires_at        BIGINT,
  token_type        TEXT,
  scope             TEXT,
  id_token          TEXT,
  session_state     TEXT,
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  "sessionToken" TEXT        UNIQUE NOT NULL,
  "userId"       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT        NOT NULL,
  token      TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ---------------------------------------------------------------------------
-- PROFILES
-- Linked to NextAuth users table instead of auth.users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT,
  locale        TEXT        NOT NULL DEFAULT 'he-IL',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create a profile row whenever a new NextAuth users row is inserted.
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created ON users;
CREATE TRIGGER on_user_created
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_profile_for_user();

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- user_id references NextAuth users; NULL = system category.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system category
  name_he     TEXT        NOT NULL,
  name_en     TEXT,
  icon        TEXT,
  color       TEXT,
  parent_id   UUID        REFERENCES categories(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- BANK_ACCOUNTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id            TEXT         NOT NULL,
  account_number        TEXT,
  display_name          TEXT,
  balance               NUMERIC(12,2),
  balance_updated_at    TIMESTAMPTZ,
  encrypted_credentials TEXT         NOT NULL,
  credentials_iv        TEXT         NOT NULL,
  credentials_tag       TEXT         NOT NULL,
  last_scraped_at       TIMESTAMPTZ,
  scrape_status         TEXT         NOT NULL DEFAULT 'idle',
  scrape_error          TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT bank_accounts_scrape_status_check
    CHECK (scrape_status IN ('idle', 'queued', 'running', 'awaiting_otp', 'done', 'error'))
);

-- ---------------------------------------------------------------------------
-- TRANSACTIONS
-- Incorporates all changes from subsequent migrations:
--   * status values: 'completed' | 'pending'  (from 20260403000001)
--   * sub_account column                       (from 20260403000002)
--   * no unique constraint on external_id to avoid NULL duplicates (from 20260404000001)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id     UUID          NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  external_id         TEXT,
  date                DATE          NOT NULL,
  processed_date      DATE,
  description         TEXT          NOT NULL,
  memo                TEXT,
  original_amount     NUMERIC(12,2),
  original_currency   TEXT,
  charged_amount      NUMERIC(12,2) NOT NULL,
  charged_currency    TEXT          NOT NULL DEFAULT 'ILS',
  type                TEXT,
  status              TEXT,
  installment_number  INT,
  installment_total   INT,
  sub_account         VARCHAR(20),
  category_id         UUID          REFERENCES categories(id) ON DELETE SET NULL,
  ai_category_raw     TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT transactions_type_check
    CHECK (type IS NULL OR type IN ('normal', 'installments', 'standing_order')),
  CONSTRAINT transactions_status_check
    CHECK (status IS NULL OR status IN ('completed', 'pending'))
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS transactions_user_id_date_idx
  ON transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS transactions_bank_account_id_idx
  ON transactions (bank_account_id);

CREATE INDEX IF NOT EXISTS transactions_category_id_idx
  ON transactions (category_id);

CREATE INDEX IF NOT EXISTS transactions_user_id_category_id_idx
  ON transactions (user_id, category_id);

-- ---------------------------------------------------------------------------
-- SCRAPE_JOBS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id     UUID        NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  triggered_by        TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'queued',
  transactions_added  INT                  DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scrape_jobs_triggered_by_check
    CHECK (triggered_by IN ('manual', 'schedule')),
  CONSTRAINT scrape_jobs_status_check
    CHECK (status IN ('queued', 'running', 'done', 'error'))
);

-- ---------------------------------------------------------------------------
-- CREDENTIAL_ACCESS_LOGS
-- Audit log for every credential access event (from 20260405000001).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credential_access_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL    DEFAULT now(),
  user_id         UUID        NOT NULL    REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id UUID        NOT NULL    REFERENCES bank_accounts(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,   -- 'stored' | 'updated' | 'decrypted' | 'deleted'
  triggered_by    TEXT,                  -- 'manual' | 'schedule' | 'user'
  scrape_job_id   UUID,
  metadata        JSONB
);

CREATE INDEX IF NOT EXISTS credential_access_logs_user_id_idx
  ON credential_access_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credential_access_logs_bank_account_id_idx
  ON credential_access_logs (bank_account_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- HEBREW SYSTEM CATEGORY SEEDS
-- Fixed UUIDs ensure idempotency across repeated migration runs.
-- ---------------------------------------------------------------------------
INSERT INTO categories (id, user_id, name_he, name_en, icon, color)
VALUES
  ('a1000000-0000-0000-0000-000000000001', NULL, 'מזון וסופרמרקט', 'Food & Grocery',   '🛒', '#22c55e'),
  ('a1000000-0000-0000-0000-000000000002', NULL, 'תחבורה',          'Transportation',   '🚗', '#3b82f6'),
  ('a1000000-0000-0000-0000-000000000003', NULL, 'בידור',            'Entertainment',    '🎬', '#a855f7'),
  ('a1000000-0000-0000-0000-000000000004', NULL, 'בריאות',           'Health',           '💊', '#ef4444'),
  ('a1000000-0000-0000-0000-000000000005', NULL, 'קניות',            'Shopping',         '🛍️', '#f97316'),
  ('a1000000-0000-0000-0000-000000000006', NULL, 'שירותים',          'Utilities',        '💡', '#eab308'),
  ('a1000000-0000-0000-0000-000000000007', NULL, 'חינוך',            'Education',        '📚', '#6366f1'),
  ('a1000000-0000-0000-0000-000000000008', NULL, 'מסעדות',           'Restaurants',      '🍽️', '#ec4899'),
  ('a1000000-0000-0000-0000-000000000009', NULL, 'הכנסה',            'Income',           '💰', '#10b981'),
  ('a1000000-0000-0000-0000-000000000010', NULL, 'אחר',              'Other',            '📦', '#6b7280')
ON CONFLICT (id) DO NOTHING;
