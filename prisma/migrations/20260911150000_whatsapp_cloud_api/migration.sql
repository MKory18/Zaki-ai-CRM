-- ─── WhatsApp Business Cloud API (additive only) ───
-- New tables only — no existing data is touched.

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_SETUP',
    "accessTokenEncrypted" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "senderPhone" TEXT,
    "recipientPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_companyId_phoneNumberId_key" ON "whatsapp_connections"("companyId", "phoneNumberId");
CREATE INDEX "whatsapp_connections_companyId_status_idx" ON "whatsapp_connections"("companyId", "status");

CREATE UNIQUE INDEX "whatsapp_conversations_companyId_connectionId_customerPhone_key" ON "whatsapp_conversations"("companyId", "connectionId", "customerPhone");
CREATE INDEX "whatsapp_conversations_companyId_status_lastMessageAt_idx" ON "whatsapp_conversations"("companyId", "status", "lastMessageAt");
CREATE INDEX "whatsapp_conversations_companyId_assignedUserId_idx" ON "whatsapp_conversations"("companyId", "assignedUserId");
CREATE INDEX "whatsapp_conversations_companyId_customerId_idx" ON "whatsapp_conversations"("companyId", "customerId");

CREATE UNIQUE INDEX "whatsapp_messages_externalMessageId_key" ON "whatsapp_messages"("externalMessageId");
CREATE INDEX "whatsapp_messages_companyId_conversationId_createdAt_idx" ON "whatsapp_messages"("companyId", "conversationId", "createdAt");
CREATE INDEX "whatsapp_messages_companyId_status_idx" ON "whatsapp_messages"("companyId", "status");

-- AddForeignKeys
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── RBAC grants (mirror the roles_full_manage_grants pattern) ───
-- Whatsapp is granted to roles consistent with existing policy:
--   whatsapp.view  + whatsapp.send   → roles that can view orders (operational staff)
--   whatsapp.assign                  → roles that can assign orders
--   whatsapp.manage                  → roles that can edit system settings
INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", k.permission, rp.scope
FROM role_permissions rp
CROSS JOIN (VALUES ('whatsapp.view'), ('whatsapp.send')) AS k(permission)
WHERE rp.permission = 'orders.view'
ON CONFLICT ("roleId", permission) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", k.permission, rp.scope
FROM role_permissions rp
CROSS JOIN (VALUES ('whatsapp.view'), ('whatsapp.send')) AS k(permission)
WHERE rp.permission = 'customers.view'
ON CONFLICT ("roleId", permission) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", 'whatsapp.assign', rp.scope
FROM role_permissions rp
WHERE rp.permission = 'orders.assign'
ON CONFLICT ("roleId", permission) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", 'whatsapp.manage', rp.scope
FROM role_permissions rp
WHERE rp.permission = 'settings.edit'
ON CONFLICT ("roleId", permission) DO NOTHING;
