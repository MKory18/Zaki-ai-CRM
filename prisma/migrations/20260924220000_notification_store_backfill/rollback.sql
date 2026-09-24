-- Undo 20260924220000_notification_store_backfill.
-- Filling a store on a row that had none loses nothing, so undoing it is
-- rarely wanted. If it is: only a row written before the "storeId" column
-- existed can have been filled by the backfill, so the bound is the moment
-- 20260924210000_notification_audience was applied — read from Prisma's own
-- record, not a guessed time. A row the application wrote after that carries
-- its store from the start, and clearing it would show a store-B order in
-- store A again; those are left alone.
--
-- started_at is timestamptz; "createdAt" is a UTC timestamp without zone.
-- If that migration is not recorded as applied, the bound is NULL and no
-- row is touched.
UPDATE "notifications"
SET "storeId" = NULL
WHERE "userId" IS NOT NULL
  AND "title" LIKE 'طلب تعديل على %'
  AND "createdAt" < (
    SELECT started_at AT TIME ZONE 'UTC'
    FROM "_prisma_migrations"
    WHERE migration_name = '20260924210000_notification_audience'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  );
