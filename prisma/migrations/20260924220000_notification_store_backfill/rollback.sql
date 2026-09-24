-- Undo 20260924220000_notification_store_backfill.
-- Filling a store on a row that had none loses nothing, so undoing it is
-- rarely wanted. If it is: the backfilled rows are the change-request rows
-- created before this migration was written; rows the application writes
-- after stage 17 carry their store from the start and are left alone.
UPDATE "notifications"
SET "storeId" = NULL
WHERE "userId" IS NOT NULL
  AND "title" LIKE 'طلب تعديل على %'
  AND "createdAt" < TIMESTAMP '2026-09-24 22:00:00';
