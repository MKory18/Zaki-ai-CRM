-- Drops the uploaded-font registry. The stored files under uploads/ are not
-- touched: deleting bytes on a rollback is how a rollback becomes the
-- outage. Sweep them separately once this is known to be permanent.
DROP TABLE IF EXISTS "store_fonts";
