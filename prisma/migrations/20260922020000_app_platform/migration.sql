-- THE APP PLATFORM (additive)
--
-- The system already had integrations — a courier adapter, tracking pixels,
-- a WhatsApp connection, Telegram sources — each with its own settings
-- screen and no common idea of "installed". Nobody could answer "what is
-- connected to this company, and who turned it on".
--
-- Two kinds share one shelf:
--
--   BUILT-IN  declared in code (src/lib/apps/registry.ts), because their
--             configuration already has a screen. The store lists them and
--             records the install; it does not copy their settings UI.
--   EXTERNAL  registered by a developer. It has a webhook and a signing
--             secret, and that is the whole of its power for now — it is
--             told what happened, it is not given the keys.
--
-- Only the install is stored for a built-in. A catalogue row in the database
-- for something that lives in code would be a second source of truth about
-- what the code supports.

CREATE TABLE IF NOT EXISTS "apps" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "developerName" TEXT,
  "iconUrl"       TEXT,
  "webhookUrl"    TEXT,
  -- Which events it asked to hear about, as a JSON array of names.
  "events"        TEXT NOT NULL DEFAULT '[]',
  -- HMAC signing secret, encrypted at rest. Shown once at registration and
  -- never again: an endpoint that can return it will one day return it to
  -- the wrong person.
  "secret"        TEXT,
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "apps_companyId_code_key" ON "apps" ("companyId", "code");

CREATE TABLE IF NOT EXISTS "app_installs" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  -- The built-in's code, or the external app's code. One column so the
  -- installed list is one query and one shape.
  "appCode"       TEXT NOT NULL,
  "appId"         TEXT,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  -- Per-install settings, encrypted: an app's configuration is as sensitive
  -- as the account it configures.
  "config"        TEXT,
  "installedById" TEXT,
  "installedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_installs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "app_installs_companyId_appCode_key"
  ON "app_installs" ("companyId", "appCode");
CREATE INDEX IF NOT EXISTS "app_installs_companyId_enabled_idx"
  ON "app_installs" ("companyId", "enabled");

-- Every attempt to tell an app something, kept. A webhook that silently
-- fails is an integration that silently stops, and the developer on the
-- other end has no way to know.
CREATE TABLE IF NOT EXISTS "app_deliveries" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "installId"    TEXT NOT NULL,
  "event"        TEXT NOT NULL,
  "payload"      TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "responseCode" INTEGER,
  "error"        TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "deliveredAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "app_deliveries_status_nextAttemptAt_idx"
  ON "app_deliveries" ("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "app_deliveries_companyId_createdAt_idx"
  ON "app_deliveries" ("companyId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "apps" ADD CONSTRAINT "apps_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "app_installs" ADD CONSTRAINT "app_installs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "app_installs" ADD CONSTRAINT "app_installs_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "app_deliveries" ADD CONSTRAINT "app_deliveries_installId_fkey"
    FOREIGN KEY ("installId") REFERENCES "app_installs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
