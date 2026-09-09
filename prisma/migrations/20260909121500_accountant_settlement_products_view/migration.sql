-- Business decision (approved): shared product visibility for finance-side roles.
-- VIEW ONLY — no product write permissions granted.
INSERT INTO role_permissions (id, "roleId", permission, scope)
SELECT gen_random_uuid(), r.id, 'products.view', 'ALL_COMPANY'
FROM roles r
WHERE r.name IN ('ACCOUNTANT', 'SETTLEMENT_OFFICER')
ON CONFLICT ("roleId", permission) DO NOTHING;
