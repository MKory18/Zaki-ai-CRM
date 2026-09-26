-- Reverses 20260927010000_followup_sees_issues.
--
-- The follow-up agent stops seeing entry issues; nothing else changes, and no
-- issue or order is touched. Anyone who was granted this permission
-- individually (a per-user override) keeps it — this only removes the grant
-- that comes with the role.
DELETE FROM "role_permissions" rp
USING "roles" r
WHERE rp."roleId" = r.id
  AND r.name = 'FOLLOW_UP_AGENT'
  AND rp.permission = 'confirmation.issues';
