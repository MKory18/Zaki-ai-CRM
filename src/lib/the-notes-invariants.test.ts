import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { repoFile, stripComments } from './guard-source';
import { NOTE_KINDS, NOTE_KIND_AR, noteKindAr } from './order-notes';

/**
 * تشطيب ١ — STAGE 1: THE COMMITMENTS LEDGER, the notes section.
 *
 * «OrderNote: id, order_id, body, author_id, created_at, kind.
 *  kind = follow_up | return | settlement | internal
 *  Immutable. No edit, no delete. Corrections are new notes. Surfaced on
 *  settlement exceptions, return receiving, tracking and order detail.
 *  Never add a typed field for a situation a note already covers.
 *  Specifically not: partial payment, customer debt, received_by, collected
 *  currency or rate, "collected by courier not remitted".»
 *
 * The sharpest section in the contract, and it holds — the shape to the
 * letter, the immutability structurally, and the forbidden list in full. One
 * of the four surfacings was missing and was built on 2026-10-02.
 */

describe('1 · the shape is the contract’s, field for field', () => {
  const model = (() => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model OrderNote {'));
    return m.slice(0, m.indexOf('\n}'));
  })();

  it('carries exactly the six fields, plus the tenant', () => {
    for (const col of ['id', 'orderId', 'body', 'authorId', 'kind', 'createdAt']) {
      expect(model, col).toMatch(new RegExp(`\\n\\s*${col}\\s`));
    }
    // `companyId` is this system's tenant key and is on every model.
    expect(model).toMatch(/\n\s*companyId\s/);
  });

  it('and NOTHING else, because every extra field is a note somebody did not write', () => {
    const cols = [...model.matchAll(/^\s{2}([a-z][A-Za-z0-9]*)\s+\S/gm)].map((m) => m[1]);
    expect(cols.sort()).toEqual(
      ['authorId', 'body', 'companyId', 'createdAt', 'id', 'kind', 'order', 'orderId'].sort()
    );
  });

  it('and the four kinds are the contract’s four', () => {
    expect([...NOTE_KINDS].sort()).toEqual(['follow_up', 'internal', 'return', 'settlement']);
    expect(model).toMatch(/kind\s+String\s+@default\("internal"\) \/\/ follow_up \| return \| settlement \| internal/);
    for (const k of NOTE_KINDS) expect(NOTE_KIND_AR[k], k).toBeTruthy();
  });

  it('and an unknown kind on an old row reads as itself, not as blank', () => {
    expect(noteKindAr('settlement')).toBe('تسوية');
    expect(noteKindAr('whatever_came_before')).toBe('whatever_came_before');
  });
});

describe('2 · immutable — no edit, no delete, anywhere', () => {
  /** Every .ts/.tsx under src, so a new door cannot be missed. */
  function filesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...filesUnder(p));
      else if (/\.tsx?$/.test(p) && !p.includes('.test.')) out.push(p);
    }
    return out;
  }
  const all = filesUnder(join(process.cwd(), 'src'));
  const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');

  it('no file updates or deletes a note', () => {
    // Swept over every file rather than a named list: the whole value of
    // «immutable» is that the next door cannot be the exception.
    const offenders = all
      .map((p) => ({ f: rel(p), src: stripComments(readFileSync(p, 'utf8')) }))
      .filter(({ src }) => /orderNote\.(update|updateMany|delete|deleteMany|upsert)\b/.test(src))
      .map(({ f }) => f);
    expect(offenders, `ملفات تُعدّل ملاحظة أو تحذفها:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the model has no `updatedAt`, so there is nothing to update', () => {
    const schema = repoFile('prisma/schema.prisma');
    const m = schema.slice(schema.indexOf('model OrderNote {'));
    // Structural, not a convention: every other model in this schema has one.
    expect(m.slice(0, m.indexOf('\n}'))).not.toMatch(/updatedAt/);
  });

  it('and the many doors that DO write one all create', () => {
    const writers = all
      .map((p) => ({ f: rel(p), src: stripComments(readFileSync(p, 'utf8')) }))
      .filter(({ src }) => /orderNote\.create\(/.test(src))
      .map(({ f }) => f);
    // A correction is a new note, so there are many creators and that is the
    // design — not a sign the rule is loose.
    expect(writers.length).toBeGreaterThan(8);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * 3 · «Surfaced on settlement exceptions, return receiving, tracking and
 * order detail.» — THE FOURTH WAS MISSING.
 *
 * Settlement, tracking and order detail each read the notes endpoint. The
 * RETURNS desk — where the context matters most, a clerk with the box open —
 * had a note INPUT and no way to read what anyone had already written. Last
 * week's «الزبون قال إنّ القطعة مكسورة» was invisible at the one moment it
 * decided what to do with the parcel.
 *
 * The settlement screen's own button and modal were extracted to
 * `OrderNotesPeek` rather than copied, and the kinds each screen wants became
 * a prop: finance reads `internal` only, the returns desk reads the three
 * that are about the goods and the person.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('3 · all four places surface them', () => {
  const READERS = [
    ['order detail', 'src/components/orders/OrderNotes.tsx'],
    ['tracking', 'src/components/screens/TrackingScreen.tsx'],
    ['settlement exceptions', 'src/components/screens/finance/DifferenceActions.tsx'],
    ['return receiving', 'src/components/screens/ReturnsScreen.tsx'],
  ] as const;

  it.each(READERS)('%s reads an order’s notes', (_where, file) => {
    const src = stripComments(repoFile(file));
    // Either it fetches the endpoint itself, or it mounts the shared peek.
    expect(src).toMatch(/\/notes`|<OrderNotesPeek/);
  });

  it('and the returns desk reads BEFORE its own input, not after', () => {
    const src = repoFile('src/components/screens/ReturnsScreen.tsx');
    const peek = src.indexOf('<OrderNotesPeek');
    const input = src.indexOf('label="ملاحظة (اختياري)"');
    expect(peek).toBeGreaterThan(-1);
    expect(input).toBeGreaterThan(-1);
    expect(peek, 'الإدخال قبل القراءة').toBeLessThan(input);
  });

  it('and it does not hand a counting clerk finance’s dispute', () => {
    // `settlement` notes are the argument with the courier about money. The
    // desk reads the three kinds that are about the goods and the person.
    const src = stripComments(repoFile('src/components/screens/ReturnsScreen.tsx'));
    expect(src).toMatch(/const GOODS_NOTES = \['follow_up', 'return', 'internal'\] as const;/);
    expect(src).toMatch(/kinds=\{GOODS_NOTES\}/);
  });

  it('and finance still reads internal only', () => {
    const src = stripComments(repoFile('src/components/screens/finance/DifferenceActions.tsx'));
    expect(src).toMatch(/const INTERNAL_ONLY = \['internal'\] as const;/);
    expect(src).toMatch(/kinds=\{INTERNAL_ONLY\}/);
  });

  it('and the peek is ONE component, not a copy per screen', () => {
    const peek = stripComments(repoFile('src/components/orders/OrderNotesPeek.tsx'));
    expect(peek).toMatch(/apiJson<\{ notes: OrderNote\[\] \}>\(`\/api\/orders\/\$\{orderId\}\/notes`\)/);
    // A failed read shows «لا تعليق», never an error: a missing note must not
    // block the work in front of the person.
    expect(peek).toMatch(/catch \{\s*setNotes\(\[\]\);/);
    // And the words come from the one owner.
    for (const f of [
      'src/components/orders/OrderNotes.tsx',
      'src/components/orders/OrderNotesPeek.tsx',
    ]) {
      expect(stripComments(repoFile(f)), f).toMatch(/from '@\/lib\/order-notes'/);
    }
  });

  it('and the four words are declared in exactly one place', () => {
    const copies = ['src/components/orders/OrderNotes.tsx', 'src/components/orders/OrderNotesPeek.tsx']
      .filter((f) => /follow_up: '[^']+'/.test(stripComments(repoFile(f))));
    expect(copies, `قاموس مكرّر في:\n${copies.join('\n')}`).toEqual([]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * 4 · «Never add a typed field for a situation a note already covers.»
 *
 * The contract names five. None exists — and each is pinned with WHY the
 * nearest real column is not it, because «it only reads it» is exactly the
 * assumption that went wrong elsewhere in this audit.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('4 · none of the five forbidden fields exists', () => {
  const schema = repoFile('prisma/schema.prisma');
  const modelBody = (name: string) => {
    const m = schema.slice(schema.indexOf(`model ${name} {`));
    return m.slice(0, m.indexOf('\n}'));
  };

  it('no partial-payment field on an order, a line or a customer', () => {
    /*
     * Scoped to the three models where such a column would MEAN «the customer
     * paid part of it». A whole-schema sweep for `paidAmount` hits
     * `Payslip.paidAmount` and `CommissionPayout.paidAmount` — paying an
     * employee, which is a different thing in a different ledger, and the
     * commission section requires it.
     */
    for (const m of ['Order', 'OrderItem', 'Customer']) {
      expect(modelBody(m), m).not.toMatch(/partialPayment|partial_payment|amountPaid|paidAmount/i);
    }
    // And nowhere at all under the customer-facing spelling.
    expect(schema).not.toMatch(/partialPayment|partial_payment/i);
  });

  it('and `Payslip.paidAmount` is not it — that is wages, in its own ledger', () => {
    expect(modelBody('Payslip')).toMatch(/paidAmount\s+Decimal/);
  });

  it('and `collectedAmount` is not it — the contract itself requires that one', () => {
    // «delivery status, settlement and collection are three fields». It is the
    // collection figure, written at the door, not a record of a customer
    // paying half.
    expect(modelBody('Order')).toMatch(/collectedAmount\s+Decimal\?/);
  });

  it('and no customer-debt field, by any spelling', () => {
    const customer = modelBody('Customer');
    expect(customer).not.toMatch(/debt|balance|owes|unpaid|credit/i);
  });

  it('and no money-receiver field on an order', () => {
    expect(modelBody('Order')).not.toMatch(/receivedBy|received_by|collectedBy|cashReceivedBy/i);
  });

  it('and `inspectedById` on a return is not it — it is the COUNT the contract demands', () => {
    // «Stock never re-enters inventory before physical count and inspection.»
    // This names who did that, about GOODS. The forbidden `received_by` sits
    // among money items and means who took the cash.
    const r = modelBody('ReturnReceipt');
    expect(r).toMatch(/inspectedById\s+String\b/);
    expect(r).toMatch(/Set only when the receiver confirms they counted and inspected/);
    expect(r).not.toMatch(/receivedById/);
  });

  it('and no collected-currency or rate on an order', () => {
    const order = modelBody('Order');
    expect(order).not.toMatch(/collectedCurrency|collectedRate|collectionRate|exchangeRate/i);
  });

  it('and the receipt’s currency and rate are not it — the contract requires those', () => {
    // «MANY lines, each with its own wallet, currency and amount» and «manual
    // exchange rate stored with the statement». They belong to the RECEIPT.
    const receipt = modelBody('StatementReceipt');
    expect(receipt).toMatch(/currencyCode String\b/);
    expect(receipt).toMatch(/exchangeRate Decimal\?/);
  });

  it('and nothing types «collected by the courier and not remitted»', () => {
    expect(schema).not.toMatch(/notRemitted|not_remitted|heldByCourier|withCourierUnremitted/i);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * AND A VOCABULARY THAT MUST NOT BE «TIDIED».
 *
 * `settlementStatus` declares ten values. Three are written as literals
 * (`NOT_APPLICABLE`, `SETTLED`, `PENDING_COLLECTION`), two by assignment
 * (`COLLECTED`), four through the finance route's validated body — and
 * `UNSETTLED` is written by nothing at all.
 *
 * It is NOT dead the way the two core states removed earlier today were:
 * production rows may hold it, it has an Arabic label in three screens, and
 * `SETTLEMENT_TRANSITIONS` gives it a way out. It is a LEGACY READ value, as
 * the transitions map already says of its two siblings. Deleting its label
 * would blank a real screen.
 *
 * Pinned so the next sweep for dead values reads this instead of removing it.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('the legacy settlement values are readable, and not written', () => {
  it('UNSETTLED has a word on every screen that can show it', () => {
    for (const f of [
      'src/components/orders/OrderDetailModal.tsx',
      'src/components/screens/TrackingScreen.tsx',
      'src/lib/order-timeline.ts',
    ]) {
      expect(repoFile(f), f).toMatch(/UNSETTLED: 'غير مسوّى'/);
    }
  });

  it('and a way out of it, like the other two legacy states', () => {
    const wf = stripComments(repoFile('src/lib/finance-workflow.ts'));
    expect(wf).toMatch(/UNSETTLED: \['SETTLED', 'REFUNDED', 'PARTIALLY_REFUNDED'\]/);
    expect(repoFile('src/lib/finance-workflow.ts')).toMatch(/legacy bridge states/);
  });

  it('and nothing writes it', () => {
    const files = [
      'src/app/api/orders/[id]/route.ts',
      'src/app/api/orders/[id]/shipping/route.ts',
      'src/app/api/orders/[id]/finance/route.ts',
      'src/lib/public-order.ts',
    ];
    for (const f of files) {
      const src = stripComments(repoFile(f));
      expect(src, f).not.toMatch(/settlementStatus:?\s*=?\s*'UNSETTLED'/);
    }
  });
});
