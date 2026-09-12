-- ─── Telegram pageName (commercial source from message text) ───
-- Additive only: one nullable column on telegram_messages.

ALTER TABLE "telegram_messages" ADD COLUMN "pageName" TEXT;
