-- AlterTable
ALTER TABLE "products" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permissionsVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL_COMPANY',
    "scopeIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "scope" TEXT,
    "scopeIds" JSONB,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_companyId_idx" ON "roles"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_companyId_name_key" ON "roles"("companyId", "name");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permission_key" ON "role_permissions"("roleId", "permission");

-- CreateIndex
CREATE INDEX "user_permissions_userId_idx" ON "user_permissions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permission_key" ON "user_permissions"("userId", "permission");

-- CreateIndex
CREATE INDEX "categories_companyId_idx" ON "categories"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_companyId_name_key" ON "categories"("companyId", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BACKFILL: system roles from legacy ROLE_PERMISSIONS (parity mapping)
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('8cb48342-a414-4478-bfc7-973848d65670', NULL, 'SUPER_ADMIN', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2c1ad0da-d3b4-4c5c-9c33-43342ebc5866', '8cb48342-a414-4478-bfc7-973848d65670', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('147e841d-0a2e-4bdc-93ba-0d73c5af0b05', '8cb48342-a414-4478-bfc7-973848d65670', 'users.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('1445fd68-166e-493c-a7ba-770e21f4fbcb', '8cb48342-a414-4478-bfc7-973848d65670', 'users.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3f57d443-b975-4ce5-a326-433c753d840b', '8cb48342-a414-4478-bfc7-973848d65670', 'users.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('566e2155-3131-4693-9afd-7d9857718644', '8cb48342-a414-4478-bfc7-973848d65670', 'roles.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e8b8e7ab-c869-4cd0-95c8-1f55b580c8e4', '8cb48342-a414-4478-bfc7-973848d65670', 'roles.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4d748406-7ad6-433f-8db3-92732175b33c', '8cb48342-a414-4478-bfc7-973848d65670', 'users.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a4940154-8116-4ca6-87bc-518d2b9f813d', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e4f3d9ce-4cdb-4311-8307-0fbc7840c2e7', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('00276c1f-7219-4ab5-9e7d-22783886fb72', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bfe4eea2-ef28-4f59-b1ce-d8fa4c5d42f2', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.assign', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('97daa82f-f793-40ea-b28e-705d74daeaa7', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.claim', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('33515e67-5702-4b6e-977b-94dcc9c93651', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.release', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('73921a16-26ea-4ae5-a923-3ac042136eea', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.unlock', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d5b063df-c18d-46a2-b5e1-25641f1a48a1', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('26c7afd7-4d8c-4ae9-999c-212871d053f6', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.confirm', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b775f317-62d4-4ceb-8430-844c8eaa9a7b', '8cb48342-a414-4478-bfc7-973848d65670', 'orders.change_status', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('89952db4-9923-4678-b397-8d90c05a5d11', '8cb48342-a414-4478-bfc7-973848d65670', 'customers.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('5c54c2c7-7c39-44f8-9849-198695ec9b3d', '8cb48342-a414-4478-bfc7-973848d65670', 'customers.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f498916c-eb03-4885-9eee-dbed92b0be84', '8cb48342-a414-4478-bfc7-973848d65670', 'customers.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('abeafb23-4ba0-47f5-896b-5f6f85f75305', '8cb48342-a414-4478-bfc7-973848d65670', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('31ea8d01-1adc-44e2-98eb-5bcf8484d62c', '8cb48342-a414-4478-bfc7-973848d65670', 'products.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('5246284a-285c-4431-9402-371438a12427', '8cb48342-a414-4478-bfc7-973848d65670', 'products.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6bddac65-1819-4028-be23-16fdeed57e4f', '8cb48342-a414-4478-bfc7-973848d65670', 'products.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('47763af6-e4d1-439d-bd3a-7bd30b520b58', '8cb48342-a414-4478-bfc7-973848d65670', 'finance.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('07a07eb6-455e-4e93-9c8d-9cb78d65240e', '8cb48342-a414-4478-bfc7-973848d65670', 'finance.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('106371ad-02b1-472b-b77f-44527644f52f', '8cb48342-a414-4478-bfc7-973848d65670', 'finance.update', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('dfa1d3ab-26c7-4110-b182-d047916799e9', '8cb48342-a414-4478-bfc7-973848d65670', 'finance.cashbox', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2c9e4ac0-dc1d-429a-9bf7-586eb4d66c38', '8cb48342-a414-4478-bfc7-973848d65670', 'settlement.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('05937d74-4186-4e7c-b3b3-9040f15cc7e3', '8cb48342-a414-4478-bfc7-973848d65670', 'settlement.upload', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('fa614cbc-30ee-4d8e-aa0a-2bf777afb923', '8cb48342-a414-4478-bfc7-973848d65670', 'settlement.review', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('fa782dc0-eb23-47f5-b68c-00f464df897e', '8cb48342-a414-4478-bfc7-973848d65670', 'inventory.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a455a3f9-842d-4de0-816c-c11d7cecdcce', '8cb48342-a414-4478-bfc7-973848d65670', 'inventory.adjust', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b22bfb2a-c99a-4974-b535-07244e843732', '8cb48342-a414-4478-bfc7-973848d65670', 'production.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7451941d-d963-402f-831f-a132137d237e', '8cb48342-a414-4478-bfc7-973848d65670', 'production.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7c950ae6-5d10-4ada-99d5-e858378f20e1', '8cb48342-a414-4478-bfc7-973848d65670', 'offers.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('47e5bf55-59e3-4362-bcad-621bec24fa22', '8cb48342-a414-4478-bfc7-973848d65670', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('90afda2c-c67e-4717-9a2a-8fba80f1c5aa', '8cb48342-a414-4478-bfc7-973848d65670', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('34afd53a-69de-448a-82c7-9b8f92f8ffbd', '8cb48342-a414-4478-bfc7-973848d65670', 'ai.use', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d66c54eb-ff6f-4638-b52b-9d8712599ea6', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b9c2594a-e5c1-48d4-8526-b734f859a5d2', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.contacts.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('efd78691-f30d-4f3e-852b-06a1bbfc1a1c', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.companies.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8426091d-6847-43d9-b6de-9b59a12d54ea', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.leads.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('38a89628-eaf3-49d3-9eb0-d16c413ff7cf', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.deals.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('cde012ee-e640-4f21-a352-a75dde021e86', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.tasks.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('92dcc789-a7a9-458f-82db-64e9aa31a15e', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.invoices.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8835e8b1-f183-4d06-a9db-04633ee2034e', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.contacts.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e6d00623-425e-488a-ada7-af7dd2ba944a', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.contacts.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ef208aba-7101-4d33-8882-3914fef147c5', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.contacts.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('53c3a30a-62dd-4797-9ced-4f90243a034c', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.companies.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('af7a68fe-a6f7-4106-bf98-05d49f694e4c', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.companies.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('dd79d879-d023-4431-a08d-8fcd626b86ef', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.companies.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('62a8ccc4-282c-467d-83b1-47ea085b36e3', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.leads.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a70dc6fa-9c56-4146-9f78-b68ddcadf643', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.leads.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4154610c-40b9-4a7a-823f-53549034a5fb', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.leads.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8576a7d5-a854-4ab2-82eb-b30dc60efa4e', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.deals.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('dcfd67ea-93aa-45fa-bde3-f5cbc6c7a818', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.deals.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('0efd1d23-8823-4828-8617-0e7ab3990040', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.deals.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('0f1348b4-681c-45f2-a98e-7bded0949828', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.tasks.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3571a977-0982-442b-9045-7ad10f045f12', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.tasks.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('25aeee39-2d5e-41c7-a170-53bc240b16dc', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.tasks.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f0056a79-6fde-4594-bc1a-af1d2bbc6189', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.invoices.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('38b97532-2d6b-496e-b85d-189fbe1afba8', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.invoices.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('211f8e77-36ea-4538-8edc-031722df8f4a', '8cb48342-a414-4478-bfc7-973848d65670', 'crm.invoices.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('161186bb-e54b-4e8f-a063-8d8f49199e3b', '8cb48342-a414-4478-bfc7-973848d65670', 'settings.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('faba0a96-5896-41d2-9ed1-35156cce708c', '8cb48342-a414-4478-bfc7-973848d65670', 'settings.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9d8b58a9-69d8-419a-9af5-e78821490cd4', '8cb48342-a414-4478-bfc7-973848d65670', 'audit.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('10e11f53-9c8d-4d63-a315-fc93204d24b1', NULL, 'COMPANY_ADMIN', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('90196064-2590-4da3-8f22-7deb415543d5', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('338f7f95-86ce-434d-b53e-decd043d308f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'users.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('133ea0ac-859f-4108-8956-0f8fb49219d5', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'users.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('aec53960-750b-4d07-8952-7065100709c1', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'users.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('acf3c142-c4ea-4c69-bb5b-0edbf664d0c2', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'roles.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('614885d1-aec1-4b3e-ac56-f27658b4a498', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'roles.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('88b8757b-c972-4f6e-9f40-864c37c8206c', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'users.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('12aeb409-865e-4649-b579-5341389a3ff8', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7f407887-7c29-4770-a15c-8662a2f0c088', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2ce7ab67-28df-4e9c-9623-7ee4f2152d72', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c7fa96f5-67bd-47fe-b948-40a4d5fcfc84', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.assign', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2ce9d2f5-097e-4862-a93b-bdcee3d354b1', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.claim', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('19102a38-c61d-4531-8e89-348abd355263', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.release', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('340d2e71-7e6e-415a-8709-272da8f9fec3', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.unlock', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2515b6d7-f759-45a2-8d40-fb8d6c939a9f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.confirm', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9276f055-fa22-4d75-afab-4e56fe74c0b2', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'orders.change_status', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bb8a3f3a-df6a-4f9c-8131-e25b8b93e753', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'customers.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6c223e5f-8ecf-4a3a-87b3-f10da3ae0032', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'customers.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('364fc506-776e-47c1-b316-1733aa907ff6', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'customers.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('15067009-2476-4bf9-98fc-2bd945b06a96', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('527aa6a1-c6b5-43de-9de8-3e29fb2eb3e8', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'products.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2584273e-cd48-4053-94ce-11c0233e18b6', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'products.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('852104f5-1e80-4597-b1b6-eaa2286f18d1', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'products.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('66972c1d-6677-4df0-b20f-139901bfee2c', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'finance.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('14363562-5e02-4f88-9636-bd0a285760fc', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'finance.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('dbd8b7c1-4b47-4127-b241-273f48f703ae', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'finance.update', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4e4a4fb0-7f9d-4c4d-8a9a-21bd356fc9d7', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'finance.cashbox', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c03e3398-d315-4b3c-88f5-e9551a1ced36', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'settlement.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('59a352cb-97fb-4e0d-8f4c-873be4648e2f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'settlement.upload', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('55c6e561-46fc-469e-831c-aecd9912f567', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'settlement.review', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3a6a6480-7395-41e2-8864-9c426d4928a3', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'inventory.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d7343bd3-cef9-4108-a0e5-b99373603658', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'inventory.adjust', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ff6a72e4-055c-4795-8f2e-196d6eec9f85', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'production.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6ad71530-fcf6-4c6f-a605-08e74b6f209d', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'production.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ede86705-6f2d-4739-806b-56292c58fa1e', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'offers.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3a86fad2-ab3d-4ffb-b4f0-bdc57f10a8b2', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c90527cd-3cf6-4027-8cc6-ea1c3be17cf2', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('cfc6e4f3-f5c0-4b2f-9f4f-0f56d36c00c1', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'ai.use', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('0545d8d5-828f-4a22-9df3-376fd52479c7', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('01e3ea8d-2933-4f4d-b425-016fd3d0016c', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.contacts.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('281de651-cbc3-4d48-a915-2146b9874ae0', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.companies.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7d0eb31d-c976-4846-9cf5-924c5c6494ff', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.leads.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('cdf42f77-36f5-4d81-9beb-7a29f3effd36', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.deals.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a7daa5aa-e6c7-49b3-8929-68d9ba848886', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.tasks.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b549be5b-381f-40fc-9a6b-64310653512b', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.invoices.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9a9713d4-edc7-4f91-8d08-05c9e52bc4b4', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.contacts.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('aff67232-5d70-446b-aeb8-7093da87a14c', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.contacts.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('02b212b0-767b-43c0-8299-cb52f997b955', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.contacts.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('56749b90-076d-4a7a-891a-5ae52e6cee8f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.companies.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('99759115-a130-4a93-a36f-c4920cfba183', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.companies.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('489ed966-91ad-4e84-858c-c2df6833548f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.companies.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('5293f29c-50c2-4f20-98a5-fad078e1a54f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.leads.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f0a78f34-3e71-4cf0-8823-eaadd91611bc', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.leads.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('eecf7c07-373d-48d8-a46b-0b8c7c25ba30', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.leads.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b580b145-18fe-4055-a036-4b8e90c3b69f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.deals.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8e7bc3fd-f409-42be-82e6-cb3ed4e08f1c', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.deals.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6a8666c9-c50b-4663-a9e4-f4bdf5cdc8e5', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.deals.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('cf57d510-8c90-45b2-8a3b-e4c410728f25', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.tasks.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('1836d62a-6000-424e-ae94-2ff594c1d38e', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.tasks.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('32ba6e71-c1a5-46a1-b382-f3ab73ce80f3', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.tasks.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7fbab08b-4aab-4aab-80f7-963cbb04783f', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.invoices.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8366cf68-7fda-4440-a9b7-842a529c2497', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.invoices.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('1c84dd65-4001-4738-9741-af2eb64f5b1d', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'crm.invoices.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('771803d4-736d-4322-b9db-f2895a027056', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'settings.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bb365cfc-be7d-4a78-8958-04004749301e', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'settings.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6c514099-c69a-4474-bfd2-50caff2d54b7', '10e11f53-9c8d-4d63-a315-fc93204d24b1', 'audit.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('27438af5-80e5-4bfb-a4c0-0b9fd912fe02', NULL, 'MANAGER', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('14fb26a6-3116-4fa5-b5ff-4bf1710b42b7', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b8d87f4b-a56a-485f-abea-3a8c684b51b0', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'users.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('fcc50665-2c67-4308-a4e0-f3abfcae1b3b', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bc624d67-af19-420a-b66a-722a2b9d67de', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2c18403e-43a4-426b-b297-3ba5ef844a20', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('28905e90-64f2-4add-87e7-a04bf9eb91cf', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.assign', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('439608d0-1bec-43da-bbcb-6119ddd49e38', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.claim', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d6d7d25d-3613-4981-b46e-288ca55bf9c7', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.release', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('69863e9d-7bf8-4d77-a9a4-3354a6fae455', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.unlock', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('dd76e25a-3420-46f2-a06b-ccc8bd0e9056', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.confirm', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ba5d027b-d3ef-4acf-bc8a-7ae30d4c09e7', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'orders.change_status', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('43faa8f7-9dfe-4274-8f87-2c6d0106ce86', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'customers.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('97380be1-3976-4986-b871-9bbb98bdc8f2', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'customers.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bbb14acd-d099-444d-81fc-d3c647857439', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'customers.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d25345b4-8b25-44e6-98cc-0a3964675a45', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6b0a8254-7a19-4958-a13d-ebcd18e4a8cb', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'products.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('596d8dcc-0ba2-4dd7-a89f-8e8201e11f39', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'products.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('36b13d72-c48a-4cab-8807-5fa59608b7e2', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'offers.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('66e38a69-c836-4433-ba03-78c97ce151d1', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'inventory.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('870816fc-0888-4d41-ad97-58596f20bf76', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'inventory.adjust', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b78ff34b-69aa-441c-b3b3-40003e92163b', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'production.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c8e7c2e6-c059-4933-a50c-bed41389cb19', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'production.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b90632bd-b5d9-4e8c-ae90-e2d08c4823e7', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b5ac3ae7-8643-4b59-a24c-a17513dca6e4', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('14e50a48-46cf-4feb-86f4-decc170ff68f', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'ai.use', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2586506e-c3e7-48dc-a043-0eb36bd8c10f', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('346d2bdb-6149-4ad0-add0-470d19834c94', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.contacts.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bafa4315-dcbc-4a91-90b6-ce03a48cd0d7', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.companies.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('20f22226-8121-4490-9b74-a5118fc6ab8d', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.leads.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('64127d16-7892-4a39-90de-0895f8417329', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.deals.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('94ff43ff-6924-4b4d-be81-3852d5f8f326', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.tasks.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c86dbd0c-f5db-456b-9d13-beeb373f751d', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.invoices.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('246513a9-c6b5-4966-8800-cd8460acc0d6', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.contacts.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ad018c11-6999-4226-9183-d91624fba580', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.contacts.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e077fdc6-38ec-4940-afc7-3e4879fbd544', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.contacts.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a0fb94d0-249c-4ca6-8cae-66e9254e95d1', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.companies.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ac6fb5ba-654c-442c-8e57-80607ea19549', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.companies.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('09aa8288-39bb-4c7c-ade1-889639627dca', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.companies.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ab6f65a3-d7d4-43f6-a03b-ceb2d2a4c439', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.leads.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('00e3d3e3-b3bf-4482-80d5-573a5474f66f', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.leads.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9cd2ad1e-6251-43bf-b5ac-ef7fbbf11a7c', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.leads.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a10e6f45-c72d-40b7-bbc7-a35d905fa771', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.deals.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('0228a88e-b840-4a49-a510-68366a240f0d', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.deals.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('03dd549b-0a74-40f1-ac5d-b27c54b921bb', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.deals.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2566d6ec-2117-46b0-9201-10f964868835', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.tasks.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3d0898c6-968c-4e92-beb2-f0219414f33c', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.tasks.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3c537833-a7fb-45ae-b3ca-a9650efd139d', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.tasks.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('777b4d2e-6403-4ccf-afab-be7ecfe157be', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.invoices.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('eaa964a7-d67d-46e6-9ffe-14ff9fa28139', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.invoices.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('531d36dd-83eb-486c-8e00-0ec8f8caa5e1', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'crm.invoices.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('1d98c0ea-dfaa-4143-ab29-e6d02cf41f6c', '27438af5-80e5-4bfb-a4c0-0b9fd912fe02', 'settings.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('187b1b90-d317-42f3-9711-5003b9df95bd', NULL, 'MODERATOR', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('fbca222f-4f30-4cf4-bfde-2e15e5ad3c7f', '187b1b90-d317-42f3-9711-5003b9df95bd', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('dd29ec94-bc2a-4640-b753-dfdd195cf842', '187b1b90-d317-42f3-9711-5003b9df95bd', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('757038a2-6e7e-48b2-9a9e-e0e9425aa123', '187b1b90-d317-42f3-9711-5003b9df95bd', 'orders.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b40511f9-5378-4925-ae31-e5a6880072a9', '187b1b90-d317-42f3-9711-5003b9df95bd', 'orders.edit', 'ASSIGNED') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9b8b4710-d3f9-4cbf-a522-d6b1ba75a256', '187b1b90-d317-42f3-9711-5003b9df95bd', 'orders.claim', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('cd5d59ee-1a60-48a4-b803-ce4387132841', '187b1b90-d317-42f3-9711-5003b9df95bd', 'orders.release', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('49d35f4e-150c-4b6a-a7b0-62a3cbd91334', '187b1b90-d317-42f3-9711-5003b9df95bd', 'orders.confirm', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c76c07e5-00c5-4f70-b4b7-3cdc52fead84', '187b1b90-d317-42f3-9711-5003b9df95bd', 'customers.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('64a673bf-1ecb-4b1e-9eea-833469faf11d', '187b1b90-d317-42f3-9711-5003b9df95bd', 'customers.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9e251562-fe5f-4279-a74e-55c534619d15', '187b1b90-d317-42f3-9711-5003b9df95bd', 'customers.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('0d742c8c-3500-4ddc-a7a8-cb159b1cacaa', '187b1b90-d317-42f3-9711-5003b9df95bd', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3a3634ad-92fa-431e-a4d6-79162c7b755d', '187b1b90-d317-42f3-9711-5003b9df95bd', 'offers.manage', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('58396b81-0903-45c2-bc44-15cf453313f6', '187b1b90-d317-42f3-9711-5003b9df95bd', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4fc8d922-a474-437e-94c0-5363c17a6fee', '187b1b90-d317-42f3-9711-5003b9df95bd', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e65319ea-4cb4-44cd-a3ac-27f7dfe5c002', '187b1b90-d317-42f3-9711-5003b9df95bd', 'ai.use', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a5b44ab9-5d67-40e0-a45b-a5b89470a0b7', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ae0dec00-7b73-499c-ad21-3dcf9a7b76d1', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.contacts.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d894caeb-13a4-4b53-895e-edb2b40d8418', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.companies.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('eb945c03-1012-4e7e-8144-6ed4456a08f3', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.leads.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8990f7d9-76ba-419c-8a02-af2efc741dfa', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.deals.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('523f84e1-33c6-4f41-82c3-c1f9cc6492f8', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.tasks.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d6839051-6153-4d51-8029-c69d4d83b654', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.invoices.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7c10d8c3-6f1f-422d-8c18-f39949e7b4a7', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.contacts.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('03bb67cd-4cf9-4122-aa17-5b464083c883', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.contacts.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('5128c3e2-fd8b-448f-b295-f318d8fd0d9a', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.contacts.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c9df13f2-2f56-4238-a367-d0aac72f2a69', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.companies.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('54d8d90b-1560-41a1-bfaf-b22e204281fa', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.companies.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f11c08c4-53dc-4ee7-95eb-a2a10b7d120c', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.companies.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b113e7d3-6dc1-4499-a0b5-b5e0cd6ca39f', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.leads.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('ccf12f05-456b-4a04-8fcc-9701cf5c0ede', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.leads.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('17bb0a22-e586-4696-89c8-62d5298916ee', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.leads.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4e45de7e-fb8c-4171-822c-554db16ba685', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.deals.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('5b8d6b07-1933-49a2-8820-d0e6878f8814', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.deals.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f2f3bebe-8fa6-48f5-a6d4-ffdee5f0105d', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.deals.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3a232b2a-de3f-4ac7-8ffc-bc882128809b', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.tasks.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('15f461ea-f12b-4410-b5a4-1ff6447a55ee', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.tasks.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('3c26d899-5e4e-4d5c-9153-a6fe86f24216', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.tasks.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e02a1958-d648-4f76-8a03-87631a20d837', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.invoices.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('355ca154-aca1-4a9a-9679-f190defae1b4', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.invoices.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('27431dad-7e98-4ca8-834d-2f847ccff197', '187b1b90-d317-42f3-9711-5003b9df95bd', 'crm.invoices.delete', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('10659fc5-2ef1-48bc-9096-2c912b7b570a', NULL, 'CONFIRMATION_AGENT', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a8007a59-7722-4e3e-af09-76fb06fbd972', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e2a62703-f9bd-4273-9b4e-028a49e6f3b1', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'orders.view', 'ASSIGNED') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4a807091-ca6c-46d1-a49f-47a05a0511bf', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'orders.edit', 'ASSIGNED') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('57f3aa7c-9799-49c0-87f5-503c70b03306', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'orders.claim', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('854c8130-8877-4ce6-a1e4-9ea89d0c4688', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'orders.release', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a67cb8eb-34e7-47ee-830a-2cd881843440', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'orders.confirm', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('a66ee90b-b1ff-41f7-b952-619e139de3ad', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'customers.view_basic', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b03a3dc3-bc81-4e1b-83da-a089e6dc413b', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8c1fcaeb-d2b0-4ce8-a42a-789fef545ce9', '10659fc5-2ef1-48bc-9096-2c912b7b570a', 'ai.use', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('cdf5ec16-f047-41a5-ae26-40f98f5576f5', NULL, 'FOLLOW_UP_AGENT', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('1e487f3e-4bc4-4aba-b925-247cecbe7aad', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f3c91c28-e67f-449b-b933-63318715ba17', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'orders.view', 'ASSIGNED') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('9e8e2c76-1259-41c1-bf40-ffdeabfe0825', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'orders.edit', 'ASSIGNED') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('91b980d0-92d3-465c-8715-91b15e8edb97', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'orders.claim', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('407c53b7-5c00-4d32-b5eb-d4b4cffb183a', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'orders.release', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4ace4b22-f633-4e3a-9c25-b77b97efabd5', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'customers.view_basic', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8a07cc8d-d3c3-432f-b629-81bbbaa37b2f', 'cdf5ec16-f047-41a5-ae26-40f98f5576f5', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('99e9b338-c523-478e-be69-9cff859b3bdb', NULL, 'DELIVERY_MANAGER', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('f2174f24-85f4-48df-8a46-1ccc9e2b7c42', '99e9b338-c523-478e-be69-9cff859b3bdb', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7832bc5e-de00-4853-a3e7-5056ab6b67c4', '99e9b338-c523-478e-be69-9cff859b3bdb', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('8418ffc4-94c5-4bee-a669-1e99d4fcd379', '99e9b338-c523-478e-be69-9cff859b3bdb', 'orders.change_status', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('32f6191b-3eae-4b49-8ed8-b23cfd3471e2', '99e9b338-c523-478e-be69-9cff859b3bdb', 'customers.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('7fdcd110-67d5-4ae0-b962-deeadd35f786', '99e9b338-c523-478e-be69-9cff859b3bdb', 'customers.edit', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b8bb3c61-4dda-4b05-a912-b3bb4fd82d72', '99e9b338-c523-478e-be69-9cff859b3bdb', 'products.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c014400e-4de9-458a-92a4-9239f15b1b44', '99e9b338-c523-478e-be69-9cff859b3bdb', 'inventory.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('d4369970-05e0-4866-8b8d-b1f9cee0b879', '99e9b338-c523-478e-be69-9cff859b3bdb', 'inventory.adjust', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4d3d4159-b65a-4953-a711-6d038927e9de', '99e9b338-c523-478e-be69-9cff859b3bdb', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('fcd6c049-7419-4185-b79f-8516ecd38593', '99e9b338-c523-478e-be69-9cff859b3bdb', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('d134fce1-c6c2-4714-9c4b-fc7b132144f7', NULL, 'SETTLEMENT_OFFICER', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('0d55176d-14d9-48db-877c-e8b25b371b7e', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('091dad0e-e965-44d5-a845-56af980e7989', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'settlement.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('b2cfb862-8a1d-4bf1-ade2-09c9247bc121', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'settlement.upload', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('1f4dd1bb-861b-4b21-b84e-7f5beb7cdee5', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'settlement.review', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('399985f8-0428-4d9a-9fc2-3b2a3fa9397a', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2cd2640d-a31a-4129-a2f9-4dbf26b73895', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('6661a56a-da4d-4fbb-aa52-39a9b6609a14', 'd134fce1-c6c2-4714-9c4b-fc7b132144f7', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('152e8df3-f4f2-4be4-8681-687375c7f768', NULL, 'ACCOUNTANT', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('faa1d133-57ff-41b9-b8ec-43121cfe04ae', '152e8df3-f4f2-4be4-8681-687375c7f768', 'dashboard.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('2cfa5aec-30db-43db-bd0c-5869f0f649f8', '152e8df3-f4f2-4be4-8681-687375c7f768', 'finance.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('bf8846ae-69ea-4ced-b691-e0021be7e7ad', '152e8df3-f4f2-4be4-8681-687375c7f768', 'finance.create', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('91d6341e-284e-4c21-afeb-a7dfae3a2036', '152e8df3-f4f2-4be4-8681-687375c7f768', 'finance.update', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('c8fb327e-54f0-4e82-ac9b-24ebd52a8e8b', '152e8df3-f4f2-4be4-8681-687375c7f768', 'finance.cashbox', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('4ce40cdf-d66e-4785-9016-8fe2aeed6871', '152e8df3-f4f2-4be4-8681-687375c7f768', 'orders.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('30528fc6-0fbf-42bd-bcf0-fb9899e1729e', '152e8df3-f4f2-4be4-8681-687375c7f768', 'reports.view', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('e6e68ec0-157d-4156-85f5-93d94cff3f81', '152e8df3-f4f2-4be4-8681-687375c7f768', 'reports.export', 'ALL_COMPANY') ON CONFLICT ("roleId", permission) DO NOTHING;
UPDATE users SET "roleId" = '8cb48342-a414-4478-bfc7-973848d65670' WHERE upper(role) = upper('SUPER_ADMIN') AND "roleId" IS NULL;
UPDATE users SET "roleId" = '10e11f53-9c8d-4d63-a315-fc93204d24b1' WHERE upper(role) = upper('COMPANY_ADMIN') AND "roleId" IS NULL;
UPDATE users SET "roleId" = '27438af5-80e5-4bfb-a4c0-0b9fd912fe02' WHERE upper(role) = upper('MANAGER') AND "roleId" IS NULL;
UPDATE users SET "roleId" = '187b1b90-d317-42f3-9711-5003b9df95bd' WHERE upper(role) = upper('MODERATOR') AND "roleId" IS NULL;
UPDATE users SET "roleId" = '10659fc5-2ef1-48bc-9096-2c912b7b570a' WHERE upper(role) = upper('CONFIRMATION_AGENT') AND "roleId" IS NULL;
UPDATE users SET "roleId" = 'cdf5ec16-f047-41a5-ae26-40f98f5576f5' WHERE upper(role) = upper('FOLLOW_UP_AGENT') AND "roleId" IS NULL;
UPDATE users SET "roleId" = '99e9b338-c523-478e-be69-9cff859b3bdb' WHERE upper(role) = upper('DELIVERY_MANAGER') AND "roleId" IS NULL;
UPDATE users SET "roleId" = 'd134fce1-c6c2-4714-9c4b-fc7b132144f7' WHERE upper(role) = upper('SETTLEMENT_OFFICER') AND "roleId" IS NULL;
UPDATE users SET "roleId" = '152e8df3-f4f2-4be4-8681-687375c7f768' WHERE upper(role) = upper('ACCOUNTANT') AND "roleId" IS NULL;
