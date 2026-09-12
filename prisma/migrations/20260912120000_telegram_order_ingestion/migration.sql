-- ─── Telegram Order Ingestion (additive only) ───
-- New tables only — no existing data is touched.

-- CreateTable
CREATE TABLE "telegram_sources" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatType" TEXT NOT NULL,
    "chatTitle" TEXT,
    "topicId" INTEGER,
    "topicName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_messages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceId" TEXT,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" INTEGER,
    "threadName" TEXT,
    "senderUserId" TEXT,
    "senderUsername" TEXT,
    "senderName" TEXT,
    "text" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "orderId" TEXT,
    "internalError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_sources_companyId_chatId_topicId_key" ON "telegram_sources"("companyId", "chatId", "topicId");
CREATE INDEX "telegram_sources_chatId_idx" ON "telegram_sources"("chatId");
CREATE INDEX "telegram_sources_companyId_isActive_idx" ON "telegram_sources"("companyId", "isActive");

-- One chat (group-level mapping) can never be bound to two companies,
-- and one topic mapping can never exist twice for the same chat.
CREATE UNIQUE INDEX "telegram_sources_chatId_group_unique" ON "telegram_sources"("chatId") WHERE "topicId" IS NULL;
CREATE UNIQUE INDEX "telegram_sources_chatId_topic_unique" ON "telegram_sources"("chatId", "topicId") WHERE "topicId" IS NOT NULL;

CREATE UNIQUE INDEX "telegram_messages_companyId_chatId_messageId_key" ON "telegram_messages"("companyId", "chatId", "messageId");
CREATE INDEX "telegram_messages_companyId_processingStatus_createdAt_idx" ON "telegram_messages"("companyId", "processingStatus", "createdAt");
CREATE INDEX "telegram_messages_companyId_sourceId_idx" ON "telegram_messages"("companyId", "sourceId");
CREATE INDEX "telegram_messages_orderId_idx" ON "telegram_messages"("orderId");

-- AddForeignKeys
ALTER TABLE "telegram_sources" ADD CONSTRAINT "telegram_sources_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "telegram_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── RBAC grants (mirror the whatsapp migration pattern) ───
-- telegram.view + telegram.receive_orders → roles that can view orders
-- telegram.manage                         → roles that can edit system settings
INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", k.permission, rp.scope
FROM role_permissions rp
CROSS JOIN (VALUES ('telegram.view'), ('telegram.receive_orders')) AS k(permission)
WHERE rp.permission = 'orders.view'
ON CONFLICT ("roleId", permission) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", 'telegram.manage', rp.scope
FROM role_permissions rp
WHERE rp.permission = 'settings.edit'
ON CONFLICT ("roleId", permission) DO NOTHING;
