import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { assertReadyToShip } from './order-state';
import { allocateDiscount } from './money';

/**
 * تشطيب ١ — STAGE 1: THE COMMITMENTS LEDGER, the inventory section.
 *
 * «Violating any line here is a defect, not a design choice.» — the
 * invariants reference, which is the formal contract this system was built
 * against. Each of its eight inventory lines is pinned here against the code
 * with the evidence the brief demands.
 *
 * Six hold. One was delivered under another name and better (custody is
 * DERIVED, like the zone). One is PARTIAL and reported.
 *
 * And one was broken in five places, found while verifying the eighth line
 * and fixed on 2026-10-02 — see «THE SHELF IS THE STORE'S» at the bottom.
 */

describe('1 · the reservation is PER LINE, never per order', () => {
  it('lives on the order line', () => {
    const schema = repoFile('prisma/schema.prisma');
    const item = schema.slice(schema.indexOf('model OrderItem {'));
    expect(item.slice(0, item.indexOf('\n}'))).toMatch(/reservedQty\s+Int\s+@default\(0\)/);
  });

  it('and the Order model carries no reservation of its own', () => {
    // A second place to hold the same fact is a second place for it to be
    // wrong — and the order-level one would be the one screens reach for.
    const schema = repoFile('prisma/schema.prisma');
    const order = schema.slice(schema.indexOf('model Order {'));
    const body = order.slice(0, order.indexOf('\n}'));
    expect(body.split('\n').filter((l) => /reserv/i.test(l) && !l.trim().startsWith('//'))).toEqual([]);
  });

  it('and the reservation counts the FREE units too', () => {
    // Gift units are goods. A shelf that does not hold them for the order is
    // a shelf that promises them to somebody else.
    const res = stripComments(repoFile('src/lib/reservation.ts'));
    expect(res).toMatch(/item\.quantity \+ item\.freeQuantity - item\.reservedQty/);
    expect(res).toMatch(/reservedQty: item\.quantity \+ item\.freeQuantity/);
    // And consumption asks for the same number, or the difference throws at
    // the door of every order that carried a gift.
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    expect(con).toMatch(/line\.quantity \+ line\.freeQuantity/);
  });
});

describe('2 · one unreserved line stops READY_TO_SHIP', () => {
  const confirmed = { confirmationStatus: 'CONFIRMED', shippingStatus: 'NOT_READY' } as never;

  it('refuses with its own code', () => {
    const v = assertReadyToShip(confirmed, [
      { quantity: 2, freeQuantity: 0, reservedQty: 2 },
      { quantity: 1, freeQuantity: 0, reservedQty: 0 },
    ]);
    expect(v.allowed).toBe(false);
    expect(v.code).toBe('UNRESERVED_LINES');
  });

  it('and the FREE units count toward being held', () => {
    // Two paid and one gift reserved as two is not a held line, or the gift
    // ships off a shelf that never promised it.
    const v = assertReadyToShip(confirmed, [{ quantity: 2, freeQuantity: 1, reservedQty: 2 }]);
    expect(v.allowed).toBe(false);
    expect(v.code).toBe('UNRESERVED_LINES');
  });

  it('and allows an order whose every line is held', () => {
    expect(assertReadyToShip(confirmed, [{ quantity: 2, freeQuantity: 1, reservedQty: 3 }]).allowed).toBe(true);
  });

  it('and an order with no lines at all is refused, not passed', () => {
    const v = assertReadyToShip(confirmed, []);
    expect(v.allowed).toBe(false);
    expect(v.code).toBe('UNRESERVED_LINES');
  });
});

describe('3 · the discount is allocated across lines proportionally', () => {
  it('and stored per line, because partial returns refund per line', () => {
    const schema = repoFile('prisma/schema.prisma');
    const item = schema.slice(schema.indexOf('model OrderItem {'));
    // A WORD, not a prefix. `/discountShare/` was satisfied by renaming the
    // column to `discountShareGone` — the substring survived the rename, so
    // the guard reported a column that no longer existed.
    expect(item.slice(0, item.indexOf('\n}'))).toMatch(/^\s*discountShare\s+\S/m);
  });

  it('and the allocation loses nothing to rounding', () => {
    // Three lines of equal value sharing 10 on a 2-decimal currency: the
    // shares must still add up to 10, not to 9.99.
    const lines = [
      { quantity: 1, unitPrice: 10 },
      { quantity: 1, unitPrice: 10 },
      { quantity: 1, unitPrice: 10 },
    ];
    const shares = allocateDiscount(lines, 10, 2);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10);
  });

  it('and it is proportional to value, not spread evenly', () => {
    const shares = allocateDiscount([{ quantity: 1, unitPrice: 90 }, { quantity: 1, unitPrice: 10 }], 10, 2);
    expect(shares[0]).toBeCloseTo(9, 10);
    expect(shares[1]).toBeCloseTo(1, 10);
  });
});

describe('4 · stock enters by a batch or a reasoned adjustment, and nothing else', () => {
  it('the adjustment door refuses to move stock without a reason', () => {
    const inv = stripComments(repoFile('src/app/api/inventory/route.ts'));
    // The reason reaches the ledger row, not just the request body.
    expect(inv).toMatch(/reason: `جرد: عُدّ \$\{input\.countedQuantity\}/);
  });

  it('and a surplus with no cost to stand on is refused, not invented', () => {
    const inv = stripComments(repoFile('src/app/api/inventory/route.ts'));
    expect(inv).toMatch(/throw new UncostedSurplus\(/);
  });

  it('and a bought product cannot enter through the production door', () => {
    const prod = stripComments(repoFile('src/app/api/production/route.ts'));
    expect(prod).toMatch(/sourceType === 'PURCHASED'/);
    expect(prod).toMatch(/code: 'WRONG_DOOR'/);
  });

  it('and the unit cost divides EVERY cost line across the quantity', () => {
    /*
     * The contract writes the formula as «unit cost + (shipping and customs ÷
     * qty)». The code generalises it: any labelled cost line — shipping,
     * customs, or anything else the run actually paid — is summed into
     * `totalProductionCost` and divided by the quantity. Two named fields
     * would have been two fields and no room for the third thing.
     */
    const prod = stripComments(repoFile('src/app/api/production/route.ts'));
    expect(prod).toMatch(/batchTotal\(\{/);
    expect(prod).toMatch(/costLines,/);
    expect(prod).toMatch(/batchUnitCost\(totalProductionCost, qty\)/);
  });
});

describe('5 · nothing re-enters the shelf before it is counted and inspected', () => {
  it('the restore takes a counted quantity and a damaged one', () => {
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    expect(con).toMatch(/receivedQty/);
    expect(con).toMatch(/damagedQty/);
  });

  it('and the damaged units do NOT go back, while their cost does', () => {
    const con = repoFile('src/lib/stock-consumption.ts');
    expect(con).toMatch(/They do not return to stock; their cost does/);
    expect(stripComments(con)).toMatch(/absorbDamaged\(\{/);
  });

  it('and nothing comes back that never left', () => {
    // Consumption is at DELIVERY, so a parcel refused at the door took no
    // units out of any batch. «Restoring» them would invent stock.
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    expect(con).toMatch(/if \(!\(await alreadyMoved\(tx, input\.orderId, SALE\)\)\) \{/);
    expect(con).toMatch(/neverConsumed: true/);
  });

  it('and the batch it comes back as says it was counted', () => {
    expect(repoFile('src/lib/stock-consumption.ts')).toMatch(/بعد العد والفحص/);
  });
});

describe('6 · allow_negative_stock is the COUNTRY’s, and it gates the shipment', () => {
  it('the column belongs to the country, not the company or the product', () => {
    const schema = repoFile('prisma/schema.prisma');
    const country = schema.slice(schema.indexOf('model Country {'));
    expect(country.slice(0, country.indexOf('\n}'))).toMatch(/allowNegativeStock/);
  });

  it('and no door reserves at ORDER creation', () => {
    // The flag gates the shipment, not the order. An order is taken from a
    // customer whatever the shelf says; what we may SHIP is the question.
    for (const door of [
      'src/lib/public-order.ts',
      'src/app/api/orders/route.ts',
      'src/lib/telegram/order-creation.ts',
      'src/app/api/orders/ai-intake/route.ts',
    ]) {
      expect(stripComments(repoFile(door)), door).not.toMatch(/reserveOrderLines\(/);
    }
  });

  it('and the two doors that DO reserve both read it off the country', () => {
    for (const door of [
      'src/app/api/orders/[id]/confirmation/route.ts',
      'src/app/api/ops/shipments/hold/route.ts',
    ]) {
      expect(stripComments(repoFile(door)), door).toMatch(
        /reserveOrderLines\(tx, [^)]*\{ allowNegativeStock: country\.allowNegativeStock \}/
      );
    }
  });

  it('and there is no third state: refused leaves the line unreserved', () => {
    const res = stripComments(repoFile('src/lib/reservation.ts'));
    // `continue`, so the line keeps reservedQty 0 and invariant 2 holds it
    // out of READY_TO_SHIP — the contract's «exceptions list».
    expect(res).toMatch(/if \(!opts\.allowNegativeStock\) continue;/);
    // And allowed means reserved AND reported as a shortage, never silent.
    expect(res).toMatch(/outcome\.shortages\.push\(\{/);
  });

  it('and the preparation screen is the exceptions list', () => {
    const prep = stripComments(repoFile('src/app/api/ops/preparation/route.ts'));
    expect(prep).toMatch(/shortages: groups\.filter\(\(g\) => g\.shortage > 0\)\.length/);
    expect(prep).toMatch(/allowNegativeStock: country\.allowNegativeStock/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * 7 · «COURIER_CUSTODY is a real location.» — DELIVERED UNDER ANOTHER NAME,
 * and the other name is better.
 *
 * There is no `COURIER_CUSTODY` location row, and there is no custody
 * column. Custody is DERIVED from the orders a courier is carrying —
 * `agent-custody.ts` says so in its own words — which is exactly what the
 * contract's FIRST invariant demands of the zone: derived, never stored.
 *
 * A stored custody location would be a fourth thing to keep in step with
 * the order's state and its courier, and the first one to drift.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('7 · the courier’s custody is derived, not a stored location', () => {
  it('and the owner of the rule says so', () => {
    const cust = repoFile('src/lib/agent-custody.ts');
    expect(cust).toMatch(/there is no custody column/);
  });

  it('and no column stores it', () => {
    const schema = repoFile('prisma/schema.prisma');
    expect(schema).not.toMatch(/custodyLocation|COURIER_CUSTODY/);
  });

  it('and the totals are computed by a function that touches no database', () => {
    // The same shape as the zone: a pure derivation, testable on its own.
    const pure = stripComments(repoFile('src/lib/agent-custody-totals.ts'));
    expect(pure).not.toMatch(/\btx\.|\bdb\./);
    expect(pure).toMatch(/export function custodyTotals\(/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * 8 · «Warehouses belong to a country. Cross-border transfer is refused by
 * rule, not by warning.» — HELD, under another name.
 *
 * There is no Warehouse model. The STORE is the warehouse: the batch carries
 * `storeId`, and `Store.countryId` is REQUIRED. So a shelf belongs to a
 * store, and a store belongs to a country.
 *
 * And the transfer is refused by CONSTRUCTION rather than by a rule: the
 * other store's batches are not in the query. That is stronger than a rule,
 * which is a thing somebody can forget to call — but it only became true on
 * 2026-10-02. See below.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('8 · a shelf belongs to a store, and a store to a country', () => {
  it('the batch carries the store', () => {
    const schema = repoFile('prisma/schema.prisma');
    const batch = schema.slice(schema.indexOf('model ProductionBatch {'));
    expect(batch.slice(0, batch.indexOf('\n}'))).toMatch(/storeId\s+String\?\s+@map\("store_id"\)/);
  });

  it('and the store’s country is required, not optional', () => {
    const schema = repoFile('prisma/schema.prisma');
    const store = schema.slice(schema.indexOf('model Store {'));
    const body = store.slice(0, store.indexOf('\n}'));
    // `String` and not `String?`: a store with no country is a shelf in no
    // currency, under no negative-stock policy, in no timezone.
    expect(body).toMatch(/countryId\s+String\s*$/m);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE SHELF IS THE STORE'S — AT EVERY DOOR.
 *
 * Found while verifying line 8, and it was one defect wearing five faces.
 * Availability and reservation were store-scoped: `onHand` filters by
 * `storeId`, `availableStock` passes it, `receiveStock` writes it. Three
 * other doors ignored it entirely:
 *
 *   · `drawDownStock` took no `storeId` at all, so a delivery drew FIFO
 *     across EVERY store's batches and could empty a shelf another store
 *     had already promised — the exact case the batch's own doc comment was
 *     written against.
 *   · the stocktake's SHORTFALL half drew company-wide while its SURPLUS
 *     half wrote to the store.
 *   · a RETURN created its batch with no `storeId`, so counted, inspected
 *     goods landed in the company-wide pile — invisible to the store-scoped
 *     availability the store's own screens read. Restored and unsellable.
 *   · and the return's cost was read off whichever store had the newest
 *     batch, moving one store's profit by another's money.
 *
 * All five now pass the order's own store, using the convention `onHand`
 * already set: null means company-wide, so an order with no store behaves
 * exactly as before.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('the shelf is the store’s, at every door', () => {
  it('the draw-down filters by the store', () => {
    const rec = stripComments(repoFile('src/lib/receiving.ts'));
    const fn = rec.slice(rec.indexOf('export async function drawDownStock('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/storeId\?: string \| null/);
    // In the WHERE of the batch query, not merely accepted and dropped.
    const where = body.slice(body.indexOf('findMany({'), body.indexOf('orderBy'));
    expect(where).toMatch(/\.\.\.\(input\.storeId \? \{ storeId: input\.storeId \} : \{\}\)/);
  });

  it('and consumption passes the order’s store', () => {
    // The window is the draw-down CALL. A match over the whole file would be
    // satisfied by the `storeId: true` in the select, which is the half that
    // reads it rather than the half that uses it.
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    const call = con.slice(con.indexOf('await drawDownStock(tx, {'));
    expect(call.slice(0, call.indexOf('});'))).toMatch(/storeId: order\.storeId,/);
  });

  it('and the stocktake’s shortfall uses the same shelf as its surplus', () => {
    const inv = stripComments(repoFile('src/app/api/inventory/route.ts'));
    const call = inv.slice(inv.indexOf('await drawDownStock(tx, {'));
    expect(call.slice(0, call.indexOf('})'))).toMatch(/storeId,/);
  });

  it('and a return comes back onto the shelf it left', () => {
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    const create = con.slice(con.indexOf('tx.productionBatch.create({'));
    expect(create.slice(0, create.indexOf('batchNumber'))).toMatch(/storeId: order\.storeId,/);
  });

  it('and the return’s cost is read off that same shelf', () => {
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    const last = con.slice(con.indexOf('const lastCost = await'));
    expect(last.slice(0, last.indexOf('orderBy'))).toMatch(
      /\.\.\.\(order\.storeId \? \{ storeId: order\.storeId \} : \{\}\)/
    );
  });

  it('and the draw-down does NOT round the cost it reports', () => {
    /*
     * It rounded to two decimals in a function that does not know the
     * currency, and the caller then rounded the result by the real minor
     * unit — so on JOD a batch at 3.333 taken three times came back as
     * 10.00 when it cost 9.999. Seventh instance of the defect fixed six
     * times on 2026-10-02, and the owner's own ruling covers it: a derived
     * figure is rounded once, by whoever knows the currency.
     */
    const rec = stripComments(repoFile('src/lib/receiving.ts'));
    const fn = rec.slice(rec.indexOf('export async function drawDownStock('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toMatch(/Math\.round\(cost \* 100\) \/ 100/);
    expect(body).toMatch(/return \{ taken: input\.quantity - left, short: left, cost \};/);
    // And the caller still rounds, by the order's own currency.
    const con = stripComments(repoFile('src/lib/stock-consumption.ts'));
    expect(con).toMatch(/roundMinor\(cost, minorUnit\)/);
  });
});
