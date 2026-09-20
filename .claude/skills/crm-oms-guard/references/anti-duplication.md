# Anti-duplication protocol

The single most expensive failure on this project is rebuilding something
that already exists under a different name. Run this before declaring
anything missing.

## Search by meaning, not by name

For EVERY cluster below, search the Prisma schema and the codebase and
report what you found under whatever name it carries.

```
order state / status / workflow / transition / stage
claim / assign / lock / ownership / pull
change request / edit request / approval / pending modification
commitment / manifest / finalize / dispatch / handoff
settlement / reconciliation / statement / courier report / payout
wallet / fund / cash box / account / treasury / movement / ledger
closing / cash count / reconcile / day close
commission / payout / incentive / bonus / ledger entry
stock / inventory / reservation / allocation / movement / batch
return / refund / RMA / reverse logistics
note / comment / remark / log entry / annotation
audit / history / timeline / activity / event log
scheduler / cron / job / worker / queue / task
landing page / funnel / storefront / page builder
bundle / offer / package / tier / upsell
attribution / campaign / utm / pixel / conversion
country / region / governorate / city / market / tenant
```

## The verdict table

One row per concept:

```
CONCEPT | FOUND AS | FILE PATH | VERDICT
```

`VERDICT` is exactly one of:

| Verdict | Meaning |
|---|---|
| `REUSE` | Exists and is correct. Wire to it, change nothing. |
| `EXTEND` | Exists but lacks a field or a case. Add in place. |
| `CONFLICT` | Exists twice, or contradicts the contract. STOP and report. |
| `GENUINELY NEW` | No equivalent exists under any name. |

You may only build what you marked `GENUINELY NEW`, and only after the
user approves that list.

## Known-existing — the burden of proof is on building new

Verified present in this repository (Stage 0, 2026-09-19). Treat a claim
that any of them is missing as a search failure until proven otherwise:

orders (single product per order: `Order.productId`, no OrderItem) ·
RBAC with scoped permissions (`Role`, `RolePermission`, `UserPermission`,
`src/lib/authorization.ts`) · claim/lock/ownership (`src/lib/order-locks.ts`,
`OrderClaimHistory`) · idempotency (claim, lock, webhooks) · audit and
timeline (`AuditLog`, `OrderActivity`, `OrderStatusLog`) · three status
fields (`confirmationStatus`, `shippingStatus`, `settlementStatus`) ·
`FinancialTransaction` ledger (no wallets) · `ShippingBatch` ·
`DeliveryProvider` (no API integration) · Telegram intake · WhatsApp
inbox · landing pages (`LandingPage`, `LandingPageOffer`,
`LandingPageRecommendation`, `OrderAddOn`) · `Offer` · manufacturing
(`ProductionBatch`, `InventoryMovement`) · tracking pixels · AI assistant ·
geo context (`Country`, `Region`, `Store`, `UserCountryAccess`,
`UserStoreAccess`, `src/lib/geo-context.ts requireContext()`) — Stage 1 ·
route registry + page guard (`src/lib/route-registry.ts`,
`src/lib/page-guard.ts`) — Stage 2 · order lines and immutable notes
(`OrderItem`, `OrderNote`), one COD function (`src/lib/money.ts`), derived
core state and zone (`src/lib/order-state.ts`), per-line reservation
(`src/lib/reservation.ts`), shared order reference (`src/lib/order-ref.ts`)
— Stage 3 · pull-next queue with caps and auto-release
(`src/lib/confirmation-queue.ts`), business calendar
(`src/lib/business-calendar.ts`), customer risk (`src/lib/customer-risk.ts`),
`OrderChangeRequest`, `OrderIssue` — Stage 4 · delivery fee tables
(`DeliveryFee`, `src/lib/delivery-fees.ts`), preparation grouping and
shipment blocking checks (`src/lib/operations.ts`), label batch tokens and
Code 128 (`src/lib/labels.ts`), return receiving (`ReturnReceipt`) — Stage 5.

## Verified ABSENT (Stage 0) — do not assume they exist

commitment point beyond `ShippingBatch` · settlement
statements / receipts / matching · wallets, transfers, closing ·
commission rules or ledger (only `User.commissionRate` and
`Order.moderatorCommission`) · LogesTechs integration · `getZone(state)` ·
blacklist · scheduler / worker · apps registry · discount alerts ·
QR on labels (Code 128 barcodes only so far).

## Known conflicts awaiting a decision

- Two COD/profit computations: `computeFinancials` (`finance-workflow.ts`)
  and `calculateRealProfit` (`financial.ts`).
- Two offer models: `Offer` and `LandingPageOffer`.
- Pixel stored twice: `LandingPage.metaPixelId` and `TrackingPixel`.
- RESOLVED in Stage 3: order numbers now come from src/lib/order-ref.ts.
- Money mostly `Float`; only the D3 snapshot fields are `Decimal(12,2)`.
- RESOLVED in Stage 2: WAREHOUSE and CONFIRMATION_SUPERVISOR added; the
  other contract roles map onto existing ones.
- Legacy Order.sellingPrice is the TOTAL for the quantity, not a unit price.
- Public landing checkout still validates Syrian phones and cities only.

## Stage-specific warnings

| Stage | What may already exist under another name |
|---|---|
| 6 — scheduler | any queue, worker, cron or task runner |
| 7 — notes | a comment, remark or annotation model |
| 8 — reservation | reservation per ORDER, needing a move to per LINE. That is an EXTEND, never a new table |
| 9 — split | a parent/child or grouping relation on orders |
| 10 — custody | a location, zone or warehouse dimension on stock movements |
| 11 — storefront | landing pages and bundles DO exist. Assemble, do not rebuild |
| 12 — apps | an app, plugin or integration registry |

## The rule

If you create a table, field or service whose job is already done under
another name, that is a defect, not a feature. Report it as a conflict
and stop.
