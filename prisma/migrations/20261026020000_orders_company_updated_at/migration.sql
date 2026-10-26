-- The media buyer's hourly read (`GET /api/v1/orders/attribution`) walks one company's orders by `updatedAt`, oldest
-- change first, 200 at a time. Without this index that is a scan of the company's every order on each page.
-- Additive only, IF NOT EXISTS: applied with `prisma db execute` and recorded with `prisma migrate resolve --applied`.
CREATE INDEX IF NOT EXISTS "orders_companyId_updatedAt_idx" ON "orders" ("companyId", "updatedAt");
