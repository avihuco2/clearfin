-- Fix transactions_status_check: israeli-bank-scrapers uses 'completed' not 'normal'
ALTER TABLE transactions
  DROP CONSTRAINT transactions_status_check,
  ADD CONSTRAINT transactions_status_check
    CHECK (status IS NULL OR status IN ('completed', 'pending'));
