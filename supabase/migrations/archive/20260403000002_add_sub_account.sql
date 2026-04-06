-- Add sub_account to store which card (last 4 digits) made each transaction
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sub_account varchar(20);
