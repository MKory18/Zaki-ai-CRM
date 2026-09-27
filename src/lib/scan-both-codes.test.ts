import { describe, expect, it } from 'vitest';
import { BARCODE_FORMATS, QR_FORMATS } from './scanning';
import { repoFile, stripComments } from './guard-source';

/**
 * QR AND BARCODE, IN RETURNS AND IN ORDERS — AND IT ALREADY WORKED.
 *
 * Measured before changing anything: one `ScanButton` used by both screens,
 * reading `qr_code` first and then the four linear formats a courier label
 * carries, in the native `BarcodeDetector` path AND in the ZXing fallback.
 * `nativeScanningWorks` even refuses the native path unless it supports
 * `qr_code`, so the fallback is what runs where QR is missing.
 *
 * The only thing wrong was the words. The button called itself «مسح
 * الباركود» and the returns field said «امسح الباركود هنا», so somebody
 * holding a label with a QR square had no reason to think this would read
 * it. A capability nobody is told about is one nobody uses.
 *
 * So this file guards the capability — which is the part that could quietly
 * rot — and the wording that advertises it.
 */

const lib = () => stripComments(repoFile('src/lib/scanning.ts'));
const button = () => stripComments(repoFile('src/components/scan/ScanButton.tsx'));
const orders = () => stripComments(repoFile('src/components/screens/OrdersScreen.tsx'));
const returns = () => stripComments(repoFile('src/components/screens/ReturnsScreen.tsx'));

describe('the reader takes both kinds of code', () => {
  it('QR, and the linear formats a courier label carries', () => {
    expect(QR_FORMATS).toContain('qr_code');
    for (const f of ['code_128', 'code_39', 'ean_13', 'itf']) {
      expect(BARCODE_FORMATS, `${f} غير مقروء`).toContain(f);
    }
  });

  /** Ours first: a label carries both, and the QR is the one that is ours. */
  it('and tries ours before the courier’s', () => {
    const src = lib();
    expect(src.indexOf('QR_FORMATS')).toBeLessThan(src.indexOf('BARCODE_FORMATS'));
    expect(src).toMatch(/const qr = new Ctor\(\{ formats: \[\.\.\.QR_FORMATS\] \}\)/);
  });

  /**
   * THE FALLBACK READS BOTH TOO.
   *
   * It is not a lesser path: `nativeScanningWorks` returns false unless the
   * browser's own detector supports `qr_code`, so ZXing is exactly what runs
   * wherever QR would otherwise be missing. A fallback that dropped QR would
   * drop it precisely where it is needed.
   */
  it('in the library fallback as much as the native one', () => {
    const src = lib();
    // THE HINTS LIST ITSELF, not the whole function. `BarcodeFormat.QR_CODE`
    // also appears further down, where a result is labelled «qr» — so
    // reading the function passed with QR deleted from the formats it asks
    // for, which is the one thing that decides whether QR is read at all.
    const at = src.indexOf('DecodeHintType.POSSIBLE_FORMATS');
    expect(at, 'قائمة الصيغ غير موجودة').toBeGreaterThan(-1);
    const hints = src.slice(at, src.indexOf(']', at));
    for (const f of ['QR_CODE', 'CODE_128', 'CODE_39', 'EAN_13', 'ITF']) {
      expect(hints, `${f} ساقطٌ من القارئ الاحتياطي`).toContain(`BarcodeFormat.${f}`);
    }
    expect(src).toMatch(/return formats\.includes\('qr_code'\)/);
  });
});

describe('and both screens offer it', () => {
  it('on orders and on returns, from the one component', () => {
    expect(orders()).toContain('<ScanButton');
    expect(returns()).toContain('<ScanButton');
    // One component, not a copy each — three copies is three ways of leaving
    // the camera on.
    expect(orders()).toContain("from '@/components/scan/ScanButton'");
    expect(returns()).toContain("from '@/components/scan/ScanButton'");
  });

  /** A scan is a search, so it obeys the permissions a typed search obeys. */
  it('feeding the same search box a person types into', () => {
    expect(orders()).toMatch(/onScan=\{\(code\) => \{[\s\S]{0,120}setSearch\(code\)/);
    expect(returns()).toMatch(/onScan=\{\(code\) => \{[\s\S]{0,300}setTerm\(code\)/);
  });

  /** Receiving twenty returns is one opening of the camera, not twenty. */
  it('and the returns desk keeps the camera open between parcels', () => {
    expect(returns()).toMatch(/continuous/);
  });
});

describe('and the words say so', () => {
  it('the button no longer calls itself a barcode scanner', () => {
    expect(button(), 'ما زال يقول «مسح الباركود»').not.toContain("title = 'مسح الباركود'");
    expect(button()).toContain('مسح الرمز (QR أو باركود)');
  });

  it('nor does either screen', () => {
    expect(returns(), 'المرتجعات ما زالت تقول باركود وحده').not.toContain('امسح الباركود');
    expect(returns()).toContain('QR أو باركود');
    expect(orders()).toContain('QR أو باركود');
  });
});
