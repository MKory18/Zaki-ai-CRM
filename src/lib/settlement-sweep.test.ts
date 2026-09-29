import { describe, expect, it } from 'vitest';
import { SWEEP_LIMIT } from './settlement';
import { repoFile, stripComments } from './guard-source';

/**
 * «MISSING FROM THE STATEMENT» MUST MEAN NO STATEMENT MENTIONS IT.
 *
 * A courier issues a statement every day or two, each covering parcels
 * delivered over an overlapping window. Sweeping the window and flagging
 * everything THIS statement did not match therefore flags the parcels that
 * belong to the courier's other statements — which is most of the shop.
 *
 * Measured on the real record the day this was written: 28 statements over
 * five weeks, and one statement of **120 lines produced 940 rows, 1754 of
 * them «طلب مسلَّم لم يرد في كشف الشركة»**. Every one of those was listed,
 * on another statement. The screen was unreadable, and the one check whose
 * whole job is to catch a parcel the courier quietly left out was buried
 * under its own false alarms.
 *
 * The old sweep also gave a DIFFERENT answer depending on which statement
 * the operator matched first, because it asked «did I match this one» of a
 * set that grows as you go.
 */

const src = () => stripComments(repoFile('src/lib/settlement.ts'));

describe('the did-they-leave-one-out sweep', () => {
  it('asks the whole record, not this statement', () => {
    const s = src();
    expect(s.length).toBeGreaterThan(2000);
    // Every line of every statement of this company, by either key.
    expect(s).toMatch(/tx\.statementLine\.findMany\(\{[\s\S]{0,300}?statement: \{ companyId \}/);
    expect(s).toMatch(/OR: \[\{ barcode: \{ in: refs \} \}, \{ merchantRef: \{ in: refs \} \}\]/);
  });

  it('and skips a parcel that any statement names', () => {
    expect(src()).toMatch(/mentioned\.has\(order\.trackingNumber\)[\s\S]{0,120}?mentioned\.has\(order\.merchantRef\)/);
  });

  it('reads both of a parcel’s names, because a courier may use either', () => {
    const s = src();
    expect(s).toMatch(/trackingNumber: true, merchantRef: true,/);
  });

  /**
   * AND THE CAP IS NOT SILENT.
   *
   * A cap is necessary — a busy month is a lot of rows — but a silent one
   * turns «none are missing» into «none of the first N», which reads the
   * same and is not. The previous one was 1000, hard-coded and unreported.
   */
  it('says so when it hits its cap', () => {
    const s = src();
    expect(SWEEP_LIMIT).toBeGreaterThanOrEqual(1000);
    expect(s).toMatch(/take: SWEEP_LIMIT,/);
    expect(s).toMatch(/if \(delivered\.length === SWEEP_LIMIT\) outcome\.sweepTruncated = true;/);
    expect(s, 'عاد السقف مكتوباً في مكانه').not.toMatch(/take: 1000,/);
  });
});
