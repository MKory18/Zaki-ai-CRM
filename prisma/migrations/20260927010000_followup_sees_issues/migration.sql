-- The follow-up agent sees the entry issues.
--
-- An entry issue is «this order came in wrong, somebody fix it». It went back
-- to the moderator who entered it — and to nobody else, so it waited for that
-- one person to open a screen. The follow-up agent is the role whose whole
-- job is chasing orders that are stuck, and she could not open the screen at
-- all: she holds `confirmation.pull` and `confirmation.work` and never held
-- `confirmation.issues`.
--
-- Same scope the moderator has it at, for the same reason: an issue belongs
-- to the company's queue, not to one person's list.
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r.id, 'confirmation.issues', 'ALL_COMPANY'
FROM "roles" r
WHERE r.name = 'FOLLOW_UP_AGENT'
ON CONFLICT ("roleId", "permission") DO NOTHING;
