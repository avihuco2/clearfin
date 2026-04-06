-- =============================================================================
-- ClearFin — Initial Schema Migration
-- Created: 2026-04-02
-- Idempotent: uses CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--             CREATE POLICY IF NOT EXISTS, and ON CONFLICT DO NOTHING seeds.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  locale        TEXT        NOT NULL DEFAULT 'he-IL',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'users can read own profile'
  ) THEN
    CREATE POLICY "users can read own profile"
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'users can update own profile'
  ) THEN
    CREATE POLICY "users can update own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Trigger: auto-create a profile row whenever a new auth.users row is inserted.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = system category
  name_he     TEXT        NOT NULL,
  name_en     TEXT,
  icon        TEXT,
  color       TEXT,
  parent_id   UUID        REFERENCES public.categories(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories'
      AND policyname = 'read system and own categories'
  ) THEN
    CREATE POLICY "read system and own categories"
      ON public.categories FOR SELECT
      USING (user_id IS NULL OR auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories'
      AND policyname = 'insert own categories'
  ) THEN
    CREATE POLICY "insert own categories"
      ON public.categories FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories'
      AND policyname = 'update own categories'
  ) THEN
    CREATE POLICY "update own categories"
      ON public.categories FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories'
      AND policyname = 'delete own categories'
  ) THEN
    CREATE POLICY "delete own categories"
      ON public.categories FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- BANK_ACCOUNTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bank_accounts'
      AND policyname = 'users can crud own bank_accounts'
  ) THEN
    CREATE POLICY "users can crud own bank_accounts"
      ON public.bank_accounts FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TRANSACTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id     UUID         NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  external_id         TEXT,
  date                DATE         NOT NULL,
  processed_date      DATE,
  description         TEXT         NOT NULL,
  memo                TEXT,
  original_amount     NUMERIC(12,2),
  original_currency   TEXT,
  charged_amount      NUMERIC(12,2) NOT NULL,
  charged_currency    TEXT          NOT NULL DEFAULT 'ILS',
  type                TEXT,
  status              TEXT,
  installment_number  INT,
  installment_total   INT,
  category_id         UUID          REFERENCES public.categories(id) ON DELETE SET NULL,
  ai_category_raw     TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT transactions_type_check
    CHECK (type IS NULL OR type IN ('normal', 'installments', 'standing_order')),
  CONSTRAINT transactions_status_check
    CHECK (status IS NULL OR status IN ('normal', 'pending')),
  CONSTRAINT transactions_bank_account_external_id_unique
    UNIQUE (bank_account_id, external_id)
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions'
      AND policyname = 'users can crud own transactions'
  ) THEN
    CREATE POLICY "users can crud own transactions"
      ON public.transactions FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS transactions_user_id_date_idx
  ON public.transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS transactions_bank_account_id_idx
  ON public.transactions (bank_account_id);

CREATE INDEX IF NOT EXISTS transactions_category_id_idx
  ON public.transactions (category_id);

CREATE INDEX IF NOT EXISTS transactions_user_id_category_id_idx
  ON public.transactions (user_id, category_id);

-- ---------------------------------------------------------------------------
-- SCRAPE_JOBS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id     UUID        NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
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

ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scrape_jobs'
      AND policyname = 'users can read own scrape_jobs'
  ) THEN
    CREATE POLICY "users can read own scrape_jobs"
      ON public.scrape_jobs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scrape_jobs'
      AND policyname = 'users can insert own scrape_jobs'
  ) THEN
    CREATE POLICY "users can insert own scrape_jobs"
      ON public.scrape_jobs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- HEBREW SYSTEM CATEGORY SEEDS
-- Fixed UUIDs ensure idempotency across repeated migration runs.
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (id, user_id, name_he, name_en, icon, color)
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
