-- «الإعدادات الحسّاسة» (settings.manage) STOPS BEING AN ALIAS OF
-- «تعديل إعدادات النظام» (settings.edit). The owner's ruling, 27/10 (RV149).
--
-- Until now LEGACY_ALIAS sent every settings.manage check to settings.edit
-- as well: whoever could edit the general settings also read and changed the
-- courier credentials, the ad-account tokens, the AI provider and its key,
-- and a «منع» on settings.manage did nothing. The alias line goes in the same
-- change as this file; this file makes sure NOBODY LOSES A DOOR when it does.
--
-- The rule it keeps: whoever passed a settings.manage door yesterday through
-- settings.edit holds settings.manage today. In the three places a grant
-- lives — the role, the role's «إرجاع للافتراضي» baseline, and the person's
-- own exception — and with a «منع» carried across, so nobody GAINS a door
-- either.
--
-- The one change in who passes, on purpose: a «منع» already standing on
-- settings.manage starts to count. The owner ticked it; it did nothing only
-- because of the alias.
--
-- Additive only: INSERT … ON CONFLICT DO NOTHING. No row is changed or
-- removed, so a role or a person who already holds settings.manage keeps
-- exactly the row they had. Every row written here has an id starting with
-- 'rv149-', which is how rollback.sql finds them and nothing else.
--
-- ORDER MATTERS. The «منع» is carried FIRST, while the roles still show who
-- held settings.manage before today: a person denied settings.edit whose role
-- ALREADY held settings.manage passed yesterday, and must not be denied now.

-- 1. A «منع» on settings.edit becomes a «منع» on settings.manage — but only
--    for a person whose role is about to receive settings.manage below (it
--    holds settings.edit) and did not hold it already. Their role comes from
--    their roleId, or — with none — from the system template named like their
--    role, as permissions-core reads it. SUPER_ADMIN passes everything anyway.
INSERT INTO "user_permissions" ("id", "userId", "permission", "effect", "scope", "scopeIds", "updatedAt")
SELECT 'rv149-' || gen_random_uuid()::text, d."userId", 'settings.manage', 'DENY', NULL, NULL, now()
FROM "user_permissions" d
JOIN "users" u ON u."id" = d."userId"
WHERE d."permission" = 'settings.edit'
  AND d."effect" = 'DENY'
  AND u."role" <> 'SUPER_ADMIN'
  AND EXISTS (
    SELECT 1 FROM "role_permissions" rp JOIN "roles" r ON r."id" = rp."roleId"
    WHERE rp."permission" = 'settings.edit'
      AND ((u."roleId" IS NOT NULL AND r."id" = u."roleId")
        OR (u."roleId" IS NULL AND r."companyId" IS NULL AND r."name" = u."role")))
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp JOIN "roles" r ON r."id" = rp."roleId"
    WHERE rp."permission" = 'settings.manage'
      AND ((u."roleId" IS NOT NULL AND r."id" = u."roleId")
        OR (u."roleId" IS NULL AND r."companyId" IS NULL AND r."name" = u."role")))
ON CONFLICT ("userId", "permission") DO NOTHING;

-- 2. A person's own «سماح» on settings.edit opened the sensitive doors too:
--    it becomes a «سماح» on settings.manage, with the same scope. A person
--    who already has any settings.manage exception keeps theirs.
INSERT INTO "user_permissions" ("id", "userId", "permission", "effect", "scope", "scopeIds", "updatedAt")
SELECT 'rv149-' || gen_random_uuid()::text, a."userId", 'settings.manage', 'ALLOW', a."scope", a."scopeIds", now()
FROM "user_permissions" a
JOIN "users" u ON u."id" = a."userId"
WHERE a."permission" = 'settings.edit'
  AND a."effect" = 'ALLOW'
  AND u."role" <> 'SUPER_ADMIN'
ON CONFLICT ("userId", "permission") DO NOTHING;

-- 3. Every role holding settings.edit — company roles AND the system
--    templates (companyId NULL), which every new company and every person
--    without a roleId reads — holds settings.manage, with the same scope.
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope", "scopeIds")
SELECT 'rv149-' || gen_random_uuid()::text, rp."roleId", 'settings.manage', rp."scope", rp."scopeIds"
FROM "role_permissions" rp
WHERE rp."permission" = 'settings.edit'
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- 4. And in the baseline «إرجاع للافتراضي» restores, or the first reset after
--    this deploy would quietly take the sensitive doors away again.
INSERT INTO "role_permission_defaults" ("id", "roleId", "permission", "scope", "scopeIds")
SELECT 'rv149-' || gen_random_uuid()::text, d."roleId", 'settings.manage', d."scope", d."scopeIds"
FROM "role_permission_defaults" d
WHERE d."permission" = 'settings.edit'
ON CONFLICT ("roleId", "permission") DO NOTHING;
