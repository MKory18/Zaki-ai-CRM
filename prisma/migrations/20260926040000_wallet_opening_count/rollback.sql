-- Reverses 20260926040000_wallet_opening_count.
--
-- It drops the COUNTS, not the opening balances: `wallets.opening_balance` is
-- untouched by this migration and stays whatever the counts set it to. What is
-- lost on rollback is the record of who counted, which cannot be recovered —
-- export the table first if the counts have already been taken.
DROP TABLE IF EXISTS "wallet_opening_counts";
