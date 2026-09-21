-- Stage 2a: store scope for landing pages, Telegram sources and shipping
-- batches; contract roles and route permissions. Additive only.

-- ─── Store columns ───
ALTER TABLE "landing_pages" ADD COLUMN "storeId" TEXT;
ALTER TABLE "shipping_batches" ADD COLUMN "storeId" TEXT;
ALTER TABLE "telegram_sources" ADD COLUMN "storeId" TEXT;

CREATE INDEX "landing_pages_storeId_idx" ON "landing_pages"("storeId");
CREATE INDEX "shipping_batches_storeId_status_idx" ON "shipping_batches"("storeId", "status");

ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipping_batches" ADD CONSTRAINT "shipping_batches_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_sources" ADD CONSTRAINT "telegram_sources_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: everything existing belongs to the company's default store.
UPDATE "landing_pages" t SET "storeId" = s.id
FROM "stores" s WHERE s."companyId" = t."companyId" AND s.slug = 'main' AND t."storeId" IS NULL;
UPDATE "shipping_batches" t SET "storeId" = s.id
FROM "stores" s WHERE s."companyId" = t."companyId" AND s.slug = 'main' AND t."storeId" IS NULL;
UPDATE "telegram_sources" t SET "storeId" = s.id
FROM "stores" s WHERE s."companyId" = t."companyId" AND s.slug = 'main' AND t."storeId" IS NULL;

-- ─── Contract roles missing from the system templates ───
INSERT INTO "roles" ("id", "companyId", "name", "isSystem", "updatedAt")
SELECT gen_random_uuid(), NULL, v.name, true, CURRENT_TIMESTAMP
FROM (VALUES ('WAREHOUSE'), ('CONFIRMATION_SUPERVISOR')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM "roles" r WHERE r."companyId" IS NULL AND r.name = v.name);

-- ─── Grants (system templates). Mirrors src/lib/route-registry.ts. ───
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r.id, g.permission, g.scope
FROM (VALUES
  -- confirmation centre
  ('CONFIRMATION_AGENT',      'confirmation.pull',        'ALL_COMPANY'),
  ('CONFIRMATION_AGENT',      'confirmation.work',        'ALL_COMPANY'),
  ('FOLLOW_UP_AGENT',         'confirmation.pull',        'ALL_COMPANY'),
  ('FOLLOW_UP_AGENT',         'confirmation.work',        'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'confirmation.work',        'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'confirmation.supervise',   'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'confirmation.issues',      'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'control.change_requests',  'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'control.discount_alerts',  'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'orders.view',              'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'customers.view_basic',     'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'reports.view',             'ALL_COMPANY'),
  ('CONFIRMATION_SUPERVISOR', 'dashboard.view',           'ALL_COMPANY'),
  ('MODERATOR',               'confirmation.issues',      'ALL_COMPANY'),
  -- operations
  ('WAREHOUSE',               'ops.prepare',              'ALL_COMPANY'),
  ('WAREHOUSE',               'ops.labels',               'ALL_COMPANY'),
  ('WAREHOUSE',               'ops.returns',              'ALL_COMPANY'),
  ('WAREHOUSE',               'inventory.view',           'ALL_COMPANY'),
  ('WAREHOUSE',               'inventory.adjust',         'ALL_COMPANY'),
  ('WAREHOUSE',               'dashboard.view',           'ALL_COMPANY'),
  ('DELIVERY_MANAGER',        'ops.ship',                 'ALL_COMPANY'),
  ('DELIVERY_MANAGER',        'ops.labels',               'ALL_COMPANY'),
  ('DELIVERY_MANAGER',        'ops.track',                'ALL_COMPANY'),
  ('DELIVERY_MANAGER',        'control.change_requests',  'ALL_COMPANY'),
  -- finance: accountant reads the audit log
  ('ACCOUNTANT',              'audit.view',               'ALL_COMPANY'),
  ('SETTLEMENT_OFFICER',      'audit.view',               'ALL_COMPANY'),
  -- managers: every new key
  ('MANAGER', 'confirmation.supervise', 'ALL_COMPANY'), ('MANAGER', 'confirmation.issues', 'ALL_COMPANY'),
  ('MANAGER', 'ops.prepare', 'ALL_COMPANY'), ('MANAGER', 'ops.ship', 'ALL_COMPANY'),
  ('MANAGER', 'ops.labels', 'ALL_COMPANY'), ('MANAGER', 'ops.track', 'ALL_COMPANY'),
  ('MANAGER', 'ops.returns', 'ALL_COMPANY'), ('MANAGER', 'control.change_requests', 'ALL_COMPANY'),
  ('MANAGER', 'control.discount_alerts', 'ALL_COMPANY'), ('MANAGER', 'control.blacklist', 'ALL_COMPANY'),
  ('MANAGER', 'growth.intelligence', 'ALL_COMPANY'), ('MANAGER', 'apps.view', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'confirmation.supervise', 'ALL_COMPANY'), ('COMPANY_ADMIN', 'confirmation.issues', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'ops.prepare', 'ALL_COMPANY'), ('COMPANY_ADMIN', 'ops.ship', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'ops.labels', 'ALL_COMPANY'), ('COMPANY_ADMIN', 'ops.track', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'ops.returns', 'ALL_COMPANY'), ('COMPANY_ADMIN', 'control.change_requests', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'control.discount_alerts', 'ALL_COMPANY'), ('COMPANY_ADMIN', 'control.blacklist', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'growth.intelligence', 'ALL_COMPANY'), ('COMPANY_ADMIN', 'apps.view', 'ALL_COMPANY'),
  ('COMPANY_ADMIN', 'apps.manage', 'ALL_COMPANY')
) AS g(role, permission, scope)
JOIN "roles" r ON r.name = g.role AND r."companyId" IS NULL
ON CONFLICT ("roleId", "permission") DO NOTHING;
