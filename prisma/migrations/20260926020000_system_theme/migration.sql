-- WHICH LOOK THIS PERSON CHOSE.
--
-- On the USER, not in browser storage: somebody who works from the counter
-- and from a laptop chose once, not twice. NULL means they have not chosen,
-- which is everybody until they do.
ALTER TABLE "users" ADD COLUMN "system_theme" TEXT;
