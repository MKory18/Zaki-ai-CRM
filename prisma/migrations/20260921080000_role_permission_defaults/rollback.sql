-- Drops the snapshot table. No other table references it, and nothing else
-- reads it: the restore button simply stops being offered.
DROP TABLE IF EXISTS "role_permission_defaults";
