-- Drops the channel list and the link to it. Every order keeps its written
-- `source`, which is what the screens read before this migration, so nothing
-- loses where it came from.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_channelId_fkey";
DROP INDEX IF EXISTS "orders_channelId_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "channelId";
DROP TABLE IF EXISTS "order_channels";
