-- Undo 20260924210000_notification_audience.
-- Loses which store each notification was about. The per-recipient rows
-- written since stay, one per person; the pre-stage-17 code reads them as
-- personal notifications, which is what they are.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_userId_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_storeId_fkey";
DROP INDEX IF EXISTS "notifications_storeId_type_createdAt_idx";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "storeId";
