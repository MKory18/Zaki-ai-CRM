-- A STORE THAT IS A TEST BENCH, AND NOT A SHOP.
--
-- «منتج تيست — بيئةٌ منعزلة … أرقامٌ لا تدخل أيَّ حسبة».
--
-- WHY A STORE AND NOT A FLAG ON THE PRODUCT. A flag on the product would
-- have to be subtracted at every place a figure is computed, and this system
-- computes figures in a lot of places: measured, 253 queries already filter
-- by `storeId` and would exclude a test store FOR FREE, against 31 that are
-- company-wide and touch money. A product flag inherits none of those 253
-- and has to defend all 284.
--
-- WHY A STORE AND NOT A SECOND COMPANY. A company boundary would be perfect
-- isolation and need no new exclusion anywhere — and it would break the
-- requirement that put this here: «إنشاءُ منتج من DNA منتجاتك الناجحة». A
-- test product is born by READING the real products, and a cross-company
-- read is the one thing this system refuses everywhere. The test bench has
-- to live inside the company whose products it learns from.
--
-- WHAT THE COLUMN DOES NOT DO: hide anything. Reference data — categories,
-- couriers, regions, settings — is the company's and is shared on purpose; a
-- bench with its own courier list is a bench that tests nothing. What this
-- marks is the boundary for FIGURES, and `src/lib/test-store.ts` is the one
-- place that says which figures.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "is_test" BOOLEAN NOT NULL DEFAULT false;

-- Read on every company-wide money aggregate, so it is read often and never
-- as the leading column of anything else.
CREATE INDEX IF NOT EXISTS "stores_company_is_test_idx" ON "stores" ("companyId", "is_test");

-- AND A TEST BENCH CANNOT BE A SHOPFRONT.
--
-- A store with `storefrontEnabled` is reachable by the public at
-- `/s/<slug>`, and a bench exists to carry half-finished products at
-- invented prices. Refusing the combination at the DATABASE rather than in a
-- screen, for the same reason every other rule in this schema is here: a
-- screen is one of several doors.
ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "stores_test_bench_is_not_public";
ALTER TABLE "stores" ADD CONSTRAINT "stores_test_bench_is_not_public"
  CHECK ("is_test" = false OR "storefrontEnabled" = false);
