-- Audit log for every credential access event.
-- Inserted by the service role only (worker + server); users can only read their own rows.

CREATE TABLE IF NOT EXISTS public.credential_access_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL    DEFAULT now(),
  user_id         uuid        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id uuid        NOT NULL    REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  action          text        NOT NULL,   -- 'stored' | 'updated' | 'decrypted' | 'deleted'
  triggered_by    text,                  -- 'manual' | 'schedule' | 'user'
  scrape_job_id   uuid,
  metadata        jsonb
);

ALTER TABLE public.credential_access_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'credential_access_logs'
      AND policyname = 'users can read own credential logs'
  ) THEN
    CREATE POLICY "users can read own credential logs"
      ON public.credential_access_logs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS credential_access_logs_user_id_idx
  ON public.credential_access_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credential_access_logs_bank_account_id_idx
  ON public.credential_access_logs (bank_account_id, created_at DESC);
