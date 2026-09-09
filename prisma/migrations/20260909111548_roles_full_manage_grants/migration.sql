-- Roles editors manage roles fully: roles.create + roles.delete companion grants
INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", k.permission, rp.scope
FROM role_permissions rp
CROSS JOIN (VALUES ('roles.create'), ('roles.delete')) AS k(permission)
WHERE rp.permission = 'roles.edit'
ON CONFLICT ("roleId", permission) DO NOTHING;
