import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { expectedAmountFor, SWEEP_LIMIT } from './settlement';
import { approvalRefusal, rematchRefusal } from './settlement-gates';

/**
 * تشطيب ١ — STAGE 1: THE COMMITMENTS LEDGER, settlement and collection.
 *
 * «Statement : what the courier says it owes. File hash, no duplicate import.
 *  Receipt   : what actually arrived. MANY lines, each with its own wallet,
 *              currency and amount…
 *  Matching  : runs on demand AFTER the receipt. Single key: merchant
 *              reference, then courier barcode. NEVER phone.»
 *
 * Three sequential entities, and the sequence is the invariant. All of it
 * holds, with two refinements where the code is better than the wording —
 * and one half-built key, found here and fixed on 2026-10-02.
 */

describe('1 · the statement is what the courier CLAIMS, and it imports once', () => {
  it('the total is read from the file, and the hash is unique by constraint', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model CourierStatement {'));
    const body = m.slice(0, m.indexOf('\n}'));
    expect(body).toMatch(/totalAmount\s+Decimal\s+@db\.Decimal\(14, 3\)/);
    // A CONSTRAINT, not a lookup. A check-then-insert loses the race, and the
    // race here is two operators uploading the same file at once.
    expect(body).toMatch(/@@unique\(\[companyId, fileHash\]\)/);
  });

  it('and the import door hashes the bytes and refuses a repeat', () => {
    const route = stripComments(repoFile('src/app/api/finance/statements/route.ts'));
    expect(route).toMatch(/const hash = fileHash\(fileBytes\)/);
    expect(route).toMatch(/where: \{ companyId, fileHash: hash \}/);
  });

  it('and a line states the collected amount and the fee apart from the net', () => {
    // The net alone cannot say WHY it is short: a collection that came in
    // light and a fee higher than agreed look identical in one number.
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model StatementLine {'));
    const body = m.slice(0, m.indexOf('\n}'));
    for (const col of ['amount', 'collected', 'fee']) expect(body, col).toMatch(new RegExp(`\\n\\s*${col}\\s`));
  });
});

describe('2 · the receipt is what ARRIVED — many lines, each its own wallet', () => {
  it('and the wallet is a required relation, restricted on delete', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model StatementReceipt {'));
    const body = m.slice(0, m.indexOf('\n}'));
    expect(body).toMatch(/walletId\s+String\b/);
    expect(body).toMatch(/currencyCode\s+String\b/);
    expect(body).toMatch(/amount\s+Decimal/);
    // A wallet that money landed in cannot be deleted out from under it.
    expect(body).toMatch(/wallet\s+Wallet\s+@relation\(fields: \[walletId\], references: \[id\], onDelete: Restrict\)/);
  });

  it('and the rate is stored when the wallet currency differs', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model StatementReceipt {'));
    expect(m.slice(0, m.indexOf('\n}'))).toMatch(/exchangeRate\s+Decimal\?/);
  });
});

describe('3 · the gap between claimed and received needs a written reason', () => {
  const gap = (over: Partial<{ gap: number; needsExplanation: boolean; unconvertible: number }> = {}) => ({
    status: 'MATCHED',
    approvedAt: null,
    gap: { gap: 120, needsExplanation: true, unconvertible: 0, ...over },
    explanation: null,
  });

  it('and approval is refused while it is unexplained', () => {
    const r = approvalRefusal(gap() as never);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('GAP_REQUIRES_EXPLANATION');
    // And the refusal names the figure, so the person writing the
    // explanation is not asked to go and find out what they are explaining.
    expect(r!.error).toMatch(/120/);
  });

  it('and allowed once somebody writes one', () => {
    expect(approvalRefusal({ ...gap(), explanation: 'الشركة حوّلت الباقي الأسبوع القادم' } as never)).toBeNull();
  });

  it('and a receipt nobody can convert blocks approval in its own right', () => {
    // Its amount is in neither «وصل فعلاً» nor the gap, so the gap it leaves
    // behind is a number about nothing. Counted apart and named, never
    // dropped silently into a total that then looks short.
    const r = approvalRefusal({ ...gap({ needsExplanation: false, unconvertible: 50 }) } as never);
    expect(r).not.toBeNull();
  });

  it('and the receipts are converted into the STATEMENT’s currency first', () => {
    const s = stripComments(repoFile('src/lib/settlement.ts'));
    expect(s).toMatch(/receiptsInStatementCurrency\(/);
    // Never a bare SUM across mixed currencies labelled with one of them.
    expect(s).not.toMatch(/_sum: \{ amount: true \}/);
  });
});

describe('4 · matching runs ON DEMAND, and only after a receipt', () => {
  it('the route refuses when no receipt exists yet', () => {
    const route = stripComments(repoFile('src/app/api/finance/statements/[id]/match/route.ts'));
    expect(route).toMatch(/_count: \{ select: \{ receipts: true \} \}/);
    expect(route).toMatch(/if \(statement\._count\.receipts === 0\)/);
  });

  it('and never re-runs over an approved statement', () => {
    const r = rematchRefusal({ status: 'APPROVED', approvedAt: new Date() });
    expect(r).not.toBeNull();
    expect(r!.code).toBe('ALREADY_APPROVED');
    // But a statement that is merely matched may be matched again: the
    // operator fixes a barcode and asks the question a second time.
    expect(rematchRefusal({ status: 'MATCHED', approvedAt: null })).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * 5 · «Single key: merchant reference, then courier barcode. NEVER phone.»
 *
 * The code reverses the ORDER, and writes its reason beside the decision: a
 * barcode is assigned by the courier, and the statement is the courier's own
 * file, written in the courier's own identifiers. The merchant reference is
 * the fallback for a courier who echoes ours back.
 *
 * Both halves of the rule that matter hold — one key at a time, never the
 * phone. The reversal is pinned here as the deliberate choice it is.
 *
 * AND THE BARCODE LOOKUP WAS UNSCOPED, fixed 2026-10-02. There is no unique
 * index on `trackingNumber`, and none could mean anything across couriers:
 * two companies issuing numeric sequences collide as a matter of course. A
 * statement from one courier could therefore attach a line to an order
 * shipped with another — and `findFirst` has no `orderBy`, so which one it
 * took was not even decided. The sweep in the same function already asked
 * the question correctly.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('5 · the key is one identifier at a time, and never the phone', () => {
  const src = stripComments(repoFile('src/lib/settlement.ts'));

  it('the barcode is tried first, and the merchant reference is the fallback', () => {
    expect(src).toMatch(/const byBarcode = line\.barcode/);
    expect(src).toMatch(/const matchedByBarcode = byBarcode !== null;/);
    // `??`, so the second lookup only happens when the first found nothing.
    expect(src).toMatch(/byBarcode \?\?\s*\(line\.merchantRef/);
  });

  it('and the match records WHICH key found it, not which the line carries', () => {
    expect(src).toMatch(/matchedBy: matchedByBarcode \? 'BARCODE' : 'MERCHANT_REF'/);
  });

  it('and the phone is never a key anywhere in matching', () => {
    const fn = src.slice(src.indexOf('export async function runMatching('));
    const body = fn.slice(0, fn.indexOf('\nexport '));
    expect(body).not.toMatch(/phone/i);
    // The reason is written down, because this is the rule somebody "helps"
    // by adding a phone fallback the first time a barcode is missing.
    expect(repoFile('src/lib/settlement.ts')).toMatch(/Never the phone/);
  });

  it('and the barcode lookup is scoped to the courier whose statement it is', () => {
    const fn = src.slice(src.indexOf('const byBarcode = line.barcode'));
    const where = fn.slice(0, fn.indexOf('select:'));
    expect(where).toMatch(/deliveryProviderId: statement\.deliveryProviderId/);
    expect(where).toMatch(/trackingNumber: line\.barcode/);
  });

  it('and the merchant-reference lookup is NOT scoped, on purpose', () => {
    // `@@unique([companyId, merchantRef])` makes it name one order whoever is
    // carrying the parcel. Scoping it would break the match for an order that
    // changed couriers after we sent it.
    const schema = repoFile('prisma/schema.prisma');
    const order = schema.slice(schema.indexOf('model Order {'));
    expect(order.slice(0, order.indexOf('\n}'))).toMatch(/@@unique\(\[companyId, merchantRef\]\)/);
    const fn = src.slice(src.indexOf('(line.merchantRef'));
    const where = fn.slice(0, fn.indexOf('select:'));
    expect(where).toMatch(/merchantRef: line\.merchantRef/);
    expect(where).not.toMatch(/deliveryProviderId/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * 6 · «three queues: matched, mismatched, missing» — DELIVERED AS FOUR, and
 * the fourth is the point.
 *
 * «Missing» has two directions and they are different problems: a line the
 * courier listed that we have no order for (MISSING_IN_SYSTEM — our data, or
 * someone else's parcel) and an order we delivered that no statement mentions
 * (MISSING_IN_STATEMENT — the courier left it out, which is money). One queue
 * holding both would make the operator sort them by eye.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('6 · the queues, and the actions on them', () => {
  it('the four results are the schema’s own vocabulary', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model SettlementMatch {'));
    expect(m.slice(0, m.indexOf('\n}'))).toMatch(
      /result\s+String \/\/ MATCHED \| MISMATCHED \| MISSING_IN_STATEMENT \| MISSING_IN_SYSTEM/
    );
  });

  it('and a difference stays OPEN until somebody answers it', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model SettlementMatch {'));
    const body = m.slice(0, m.indexOf('\n}'));
    // Null resolution IS the open queue — not a separate flag that can
    // disagree with it.
    expect(body).toMatch(/resolution\s+String\?/);
    expect(body).toMatch(/ACCEPTED_COURIER \| OURS_STANDS/);
    expect(body).toMatch(/resolvedById\s+String\?/);
  });

  it('and the fee is compared in its own right, not folded into the net', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model SettlementMatch {'));
    const body = m.slice(0, m.indexOf('\n}'));
    for (const col of ['expectedFee', 'statementFee', 'feeDifference']) {
      expect(body, col).toMatch(new RegExp(`\\n\\s*${col}\\s`));
    }
    // And a returned parcel is charged no fee, so its fee is not compared.
    expect(stripComments(repoFile('src/lib/settlement.ts'))).toMatch(
      /const feeWrong = feeDifference !== null && feeDifference !== 0 && expected > 0;/
    );
  });

  it('and «missing» is asked of the WHOLE record, not of this statement', () => {
    // A courier issues overlapping statements. Flagging everything THIS one
    // did not match flags most of the shop — measured at 1,754 false rows
    // from a single 120-line statement.
    const src = stripComments(repoFile('src/lib/settlement.ts'));
    expect(src).toMatch(/statement: \{ companyId \},/);
    expect(src).toMatch(/OR: \[\{ barcode: \{ in: refs \} \}, \{ merchantRef: \{ in: refs \} \}\]/);
  });

  it('and the sweep’s cap is never silent', () => {
    // «none are missing» and «none of the first five thousand» read the same
    // and are not the same sentence.
    expect(SWEEP_LIMIT).toBe(5000);
    const src = stripComments(repoFile('src/lib/settlement.ts'));
    expect(src).toMatch(/if \(delivered\.length === SWEEP_LIMIT\) outcome\.sweepTruncated = true;/);
  });
});

describe('7 · a partial delivery is measured against what actually happened', () => {
  it('uses the collected amount, never the original total', () => {
    const partial = expectedAmountFor({
      shippingStatus: 'PARTIALLY_DELIVERED',
      totalAmount: 100,
      collectedAmount: 40,
      deliveryFee: 5,
    });
    // 40 collected, less the 5 the courier keeps.
    expect(partial).toBe(35);
  });

  it('and falls back to the total only when nothing was recorded', () => {
    expect(expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 100, collectedAmount: null, deliveryFee: 5 })).toBe(95);
  });

  it('and a zero collection is honoured, not treated as absent', () => {
    // `collectedAmount: 0` is a fact: the customer took the parcel and paid
    // nothing. A falsy check here would bill the courier the whole total.
    expect(expectedAmountFor({ shippingStatus: 'PARTIALLY_DELIVERED', totalAmount: 100, collectedAmount: 0, deliveryFee: 0 })).toBe(0);
  });

  it('and a returned parcel expects nothing at all', () => {
    for (const shippingStatus of ['RETURNED', 'RETURN_REQUESTED']) {
      expect(expectedAmountFor({ shippingStatus, totalAmount: 100, collectedAmount: null, deliveryFee: 5 }), shippingStatus).toBe(0);
    }
  });

  it('and the partial is swept for too, or a courier could omit every one', () => {
    const src = stripComments(repoFile('src/lib/settlement.ts'));
    expect(src).toMatch(/shippingStatus: \{ in: \['DELIVERED', 'PARTIALLY_DELIVERED'\] \}/);
  });
});
