-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "countryId" TEXT,
ADD COLUMN     "storeId" TEXT;

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "minorUnit" INTEGER NOT NULL DEFAULT 2,
    "workHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "workHoursEnd" TEXT NOT NULL DEFAULT '17:00',
    "weekendDays" INTEGER[] DEFAULT ARRAY[5]::INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Damascus',
    "orderPrefix" TEXT NOT NULL DEFAULT 'ORD',
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "type" TEXT NOT NULL DEFAULT 'MULTI_PRODUCT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_country_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_country_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_store_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_store_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "countries_companyId_isActive_idx" ON "countries"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "countries_companyId_code_key" ON "countries"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_countryId_name_key" ON "regions"("countryId", "name");

-- CreateIndex
CREATE INDEX "stores_countryId_status_idx" ON "stores"("countryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stores_companyId_slug_key" ON "stores"("companyId", "slug");

-- CreateIndex
CREATE INDEX "user_country_access_countryId_idx" ON "user_country_access"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "user_country_access_userId_countryId_key" ON "user_country_access"("userId", "countryId");

-- CreateIndex
CREATE INDEX "user_store_access_storeId_idx" ON "user_store_access"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_store_access_userId_storeId_key" ON "user_store_access"("userId", "storeId");

-- CreateIndex
CREATE INDEX "orders_storeId_createdAt_idx" ON "orders"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_countryId_idx" ON "orders"("countryId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_country_access" ADD CONSTRAINT "user_country_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_country_access" ADD CONSTRAINT "user_country_access_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Backfill (Stage 1): one default country + one default store per
-- existing company, every existing order and company user attached.
-- Idempotent: safe if a company already has countries.
-- ─────────────────────────────────────────────────────────────

-- 1. Default country from Company.country / Company.currency.
--    Company.country is free text (e.g. 'الأردن', 'SY', 'US'); known values
--    map to ISO codes, anything else becomes 'ZZ' to be fixed in /settings/geo.
INSERT INTO "countries" ("id", "companyId", "code", "name", "currencyCode", "minorUnit",
                         "weekendDays", "timezone", "orderPrefix", "updatedAt")
SELECT gen_random_uuid(), c.id, m.code, COALESCE(NULLIF(TRIM(c.country), ''), m.code),
       UPPER(c.currency),
       CASE UPPER(c.currency) WHEN 'JOD' THEN 3 WHEN 'IQD' THEN 3 WHEN 'KWD' THEN 3
                              WHEN 'BHD' THEN 3 WHEN 'OMR' THEN 3 ELSE 2 END,
       CASE m.code WHEN 'JO' THEN ARRAY[5,6] WHEN 'SA' THEN ARRAY[5,6] WHEN 'EG' THEN ARRAY[5,6]
                   WHEN 'IQ' THEN ARRAY[5,6] WHEN 'AE' THEN ARRAY[6,0] WHEN 'US' THEN ARRAY[6,0]
                   ELSE ARRAY[5] END,
       CASE m.code WHEN 'SY' THEN 'Asia/Damascus' WHEN 'JO' THEN 'Asia/Amman'
                   WHEN 'EG' THEN 'Africa/Cairo'  WHEN 'IQ' THEN 'Asia/Baghdad'
                   WHEN 'LB' THEN 'Asia/Beirut'   WHEN 'SA' THEN 'Asia/Riyadh'
                   WHEN 'AE' THEN 'Asia/Dubai'    ELSE 'UTC' END,
       'ORD', CURRENT_TIMESTAMP
FROM "companies" c
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN UPPER(TRIM(c.country)) IN ('SY', 'SYRIA') OR TRIM(c.country) = 'سوريا' THEN 'SY'
    WHEN UPPER(TRIM(c.country)) IN ('JO', 'JORDAN') OR TRIM(c.country) = 'الأردن' THEN 'JO'
    WHEN UPPER(TRIM(c.country)) IN ('EG', 'EGYPT') OR TRIM(c.country) = 'مصر' THEN 'EG'
    WHEN UPPER(TRIM(c.country)) IN ('IQ', 'IRAQ') OR TRIM(c.country) = 'العراق' THEN 'IQ'
    WHEN UPPER(TRIM(c.country)) IN ('LB', 'LEBANON') OR TRIM(c.country) = 'لبنان' THEN 'LB'
    WHEN UPPER(TRIM(c.country)) IN ('SA', 'SAUDI ARABIA') OR TRIM(c.country) = 'السعودية' THEN 'SA'
    WHEN UPPER(TRIM(c.country)) IN ('AE', 'UAE') OR TRIM(c.country) = 'الإمارات' THEN 'AE'
    WHEN UPPER(TRIM(c.country)) IN ('US', 'USA') THEN 'US'
    ELSE 'ZZ' END AS code
) m
WHERE NOT EXISTS (SELECT 1 FROM "countries" x WHERE x."companyId" = c.id);

-- 2. Syrian governorates for SY countries (source: src/lib/locations/syria.ts).
INSERT INTO "regions" ("id", "countryId", "name", "sortOrder")
SELECT gen_random_uuid(), co.id, g.name, g.ord
FROM "countries" co
CROSS JOIN (VALUES
  ('دمشق', 1), ('ريف دمشق', 2), ('حلب', 3), ('حمص', 4), ('حماة', 5),
  ('اللاذقية', 6), ('طرطوس', 7), ('إدلب', 8), ('دير الزور', 9), ('الحسكة', 10),
  ('الرقة', 11), ('درعا', 12), ('السويداء', 13), ('القنيطرة', 14)
) AS g(name, ord)
WHERE co.code = 'SY'
ON CONFLICT ("countryId", "name") DO NOTHING;

-- 3. Default store per company, in its default country.
INSERT INTO "stores" ("id", "companyId", "countryId", "name", "slug", "logo", "updatedAt")
SELECT gen_random_uuid(), c.id, co.id, c.name, 'main', c.logo, CURRENT_TIMESTAMP
FROM "companies" c
JOIN LATERAL (SELECT id FROM "countries" WHERE "companyId" = c.id ORDER BY "createdAt" LIMIT 1) co ON TRUE
WHERE NOT EXISTS (SELECT 1 FROM "stores" s WHERE s."companyId" = c.id);

-- 4. Attach every existing order to its company's default country + store.
UPDATE "orders" o
SET "countryId" = s."countryId", "storeId" = s.id
FROM "stores" s
WHERE s."companyId" = o."companyId" AND s.slug = 'main' AND o."storeId" IS NULL;

-- 5. Every existing company user may enter the default country.
INSERT INTO "user_country_access" ("id", "userId", "countryId")
SELECT gen_random_uuid(), u.id, s."countryId"
FROM "users" u
JOIN "stores" s ON s."companyId" = u."companyId" AND s.slug = 'main'
ON CONFLICT ("userId", "countryId") DO NOTHING;

-- 6. Permissions. geo.manage (add/edit countries, stores, regions, access):
--    owner + manager roles. geo.view: any role that can view settings.
--    Mirrors GEO_MANAGER_ROLES in src/lib/permissions-core.ts (legacy path).
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r.id, k.permission, 'ALL_COMPANY'
FROM "roles" r
CROSS JOIN (VALUES ('geo.view'), ('geo.manage')) AS k(permission)
WHERE r.name IN ('COMPANY_ADMIN', 'MANAGER')
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), rp."roleId", 'geo.view', 'ALL_COMPANY'
FROM "role_permissions" rp
WHERE rp.permission = 'settings.view'
ON CONFLICT ("roleId", "permission") DO NOTHING;
