-- A FILS IS NOT A ROUNDING ERROR.
--
-- Twenty-six money columns were `numeric(12,2)` while the product serves
-- Jordan, whose dinar has THREE decimals (`countries.minorUnit = 3`).
--
-- PROVED IN POSTGRES ITSELF, not reasoned about:
--
--     select 2.555::numeric(12,2),  2.555::numeric(14,3);
--      ->        2.56                     2.555
--
-- Five fils lost on the way INTO the column, every time, silently. On a
-- ten-line order that is five piastres; across a day of orders it is money
-- that reconciliation can never explain, because the figure it would be
-- compared against was rounded before anybody saw it.
--
-- AND THE SCREENS WERE ALREADY RIGHT, which made it worse rather than
-- better: `money-decimals.test.ts` holds every screen to the currency's own
-- decimals, so a JOD figure was printed with three confident digits — the
-- last of them invented by a rounding nobody chose.
--
-- ── WHY THIS IS SAFE ──
--
-- Widening is not a conversion. Every value in `numeric(12,2)` is exactly
-- representable in `numeric(14,3)`: 2.50 becomes 2.500, the same number.
-- Nothing is truncated, nothing is rounded, and no row can fail the cast.
-- The reverse would be destructive; this direction cannot be.
--
-- MEASURED BEFORE WRITING THIS: 165 rows across the nine affected tables
-- (users 21, orders 56, order_items 56, delivery_fees 25, return_receipts 7,
-- financial_transactions 0, penalty_rules 0, penalties 0, payslips 0).
-- Postgres rewrites a table to change a numeric's precision, so the cost is
-- one rewrite per table of at most 56 rows.
--
-- Grouped one ALTER per table, because Postgres rewrites once per statement
-- rather than once per column.

ALTER TABLE "users"
  ALTER COLUMN "salary_amount" TYPE numeric(14,3);

ALTER TABLE "orders"
  ALTER COLUMN "subtotal"          TYPE numeric(14,3),
  ALTER COLUMN "discount"          TYPE numeric(14,3),
  ALTER COLUMN "shippingRevenue"   TYPE numeric(14,3),
  ALTER COLUMN "totalRevenue"      TYPE numeric(14,3),
  ALTER COLUMN "productCost"       TYPE numeric(14,3),
  ALTER COLUMN "packagingCost"     TYPE numeric(14,3),
  ALTER COLUMN "advertisingCost"   TYPE numeric(14,3),
  ALTER COLUMN "otherCost"         TYPE numeric(14,3),
  ALTER COLUMN "refundAmount"      TYPE numeric(14,3),
  ALTER COLUMN "grossProfit"       TYPE numeric(14,3),
  ALTER COLUMN "netProfit"         TYPE numeric(14,3),
  -- The statement figure, which WINS over what was counted at the door.
  -- The worst column in the database to round, and it was rounded.
  ALTER COLUMN "collectedAmount"   TYPE numeric(14,3);

ALTER TABLE "financial_transactions"
  ALTER COLUMN "amount" TYPE numeric(14,3);

ALTER TABLE "order_items"
  ALTER COLUMN "unitPrice"     TYPE numeric(14,3),
  ALTER COLUMN "discountShare" TYPE numeric(14,3),
  ALTER COLUMN "lineTotal"     TYPE numeric(14,3);

ALTER TABLE "delivery_fees"
  ALTER COLUMN "fee"       TYPE numeric(14,3),
  ALTER COLUMN "returnFee" TYPE numeric(14,3);

ALTER TABLE "return_receipts"
  ALTER COLUMN "courierFeeAmount" TYPE numeric(14,3);

ALTER TABLE "penalty_rules"
  ALTER COLUMN "period_cap" TYPE numeric(14,3);

ALTER TABLE "penalties"
  ALTER COLUMN "amount" TYPE numeric(14,3);

-- `payslips` IS SNAKE_CASE IN THE DATABASE, all four columns.
--
-- Three of these were written as `penaltyTotal`, `netAmount` and
-- `carriedOver` — the Prisma FIELD names — and the migration would have
-- failed on the first of them. Found by reading
-- `information_schema.columns` rather than by deriving the names from the
-- schema file, which is the only way to know which fields carry an `@map`.
ALTER TABLE "payslips"
  ALTER COLUMN "salary_amount" TYPE numeric(14,3),
  ALTER COLUMN "penalty_total" TYPE numeric(14,3),
  ALTER COLUMN "net_amount"    TYPE numeric(14,3),
  ALTER COLUMN "carried_over"  TYPE numeric(14,3);

-- AND A TWENTY-SEVENTH COLUMN THE SWEEP ALMOST MISSED.
--
-- `campaigns.spend` was `numeric(14,2)` — fourteen digits and TWO decimals
-- — so a search-and-replace over `Decimal(12, 2)` passed straight over it.
-- It is money that left for Meta, typed in by the person who paid it or
-- pulled from the platform, and it rounds in JOD exactly like the rest.
--
-- The query that found it asked the DATABASE for every numeric column with
-- a scale of 2, which is a question about the thing itself rather than
-- about the file that describes it.
ALTER TABLE "campaigns"
  ALTER COLUMN "spend" TYPE numeric(14,3);
