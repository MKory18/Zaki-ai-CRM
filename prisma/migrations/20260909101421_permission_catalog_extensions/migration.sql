-- ─── Permission catalog extensions: granular CRM keys + offers.view (parity grants) ───
-- Roles holding crm.manage get full notes/activities keys; crm.view holders get views.
INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", k.permission, rp.scope
FROM role_permissions rp
CROSS JOIN (VALUES
  ('crm.notes.view'), ('crm.notes.create'), ('crm.notes.edit'), ('crm.notes.delete'),
  ('crm.activities.view'), ('crm.activities.create'), ('crm.activities.delete')
) AS k(permission)
WHERE rp.permission = 'crm.manage'
ON CONFLICT ("roleId", permission) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", k.permission, rp.scope
FROM role_permissions rp
CROSS JOIN (VALUES ('crm.notes.view'), ('crm.activities.view')) AS k(permission)
WHERE rp.permission = 'crm.view'
ON CONFLICT ("roleId", permission) DO NOTHING;

-- offers.view granted wherever offers.manage exists (read companion key)
INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), rp."roleId", 'offers.view', rp.scope
FROM role_permissions rp
WHERE rp.permission = 'offers.manage'
ON CONFLICT ("roleId", permission) DO NOTHING;
