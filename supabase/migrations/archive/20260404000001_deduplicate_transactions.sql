-- Remove duplicate transactions caused by NULL external_id not being equal in Postgres.
-- Keep the earliest inserted row for each (bank_account_id, date, description, charged_amount) group.
DELETE FROM public.transactions
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY bank_account_id, date, description, charged_amount
        ORDER BY created_at ASC
      ) AS rn
    FROM public.transactions
  ) ranked
  WHERE rn > 1
);
