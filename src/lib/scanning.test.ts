import { afterEach, describe, expect, it, vi } from 'vitest';
import { BARCODE_FORMATS, cleanScan, makeReader, nativeScanningWorks, QR_FORMATS, RecentScans } from './scanning';

/**
 * A code read off a piece of paper is untrusted input. Anybody can print a
 * QR; pointing a phone at one is not an act of authentication, and the
 * string that comes out of it must be treated exactly like something typed
 * by a stranger — because that is what it is.
 */

const g = globalThis as unknown as { BarcodeDetector?: unknown };

afterEach(() => {
  delete g.BarcodeDetector;
  vi.restoreAllMocks();
});

describe('what a scanned string is allowed to be', () => {
  it('accepts our own reference, and normalises its case', () => {
    expect(cleanScan('sy-2026-0148')).toBe('SY-2026-0148');
    expect(cleanScan('  SY-2026-0148  ')).toBe('SY-2026-0148');
  });

  it("accepts a courier's barcode", () => {
    expect(cleanScan('LT123456789')).toBe('LT123456789');
  });

  // Every one of these is a real thing a QR can contain, and none of them
  // is one of our labels.
  it('refuses a URL — a printed QR is not a link we follow', () => {
    expect(cleanScan('https://example.com/orders/1')).toBeNull();
  });

  it('refuses a JSON payload', () => {
    expect(cleanScan('{"orderId":"1"}')).toBeNull();
  });

  it('refuses a phone number, and anything else with punctuation in it', () => {
    expect(cleanScan('+962790000000')).toBeNull();
    expect(cleanScan("SY-2026-0148' OR 1=1")).toBeNull();
    expect(cleanScan('SY 2026 0148')).toBeNull();
  });

  it('refuses something too short to be a reference, or too long to be one', () => {
    expect(cleanScan('A')).toBeNull();
    expect(cleanScan('AB')).toBeNull();
    expect(cleanScan('A'.repeat(41))).toBeNull();
    // The boundaries themselves are inside.
    expect(cleanScan('ABC')).toBe('ABC');
    expect(cleanScan('A'.repeat(40))).toBe('A'.repeat(40));
  });

  it('refuses an empty frame', () => {
    expect(cleanScan('')).toBeNull();
    expect(cleanScan('   ')).toBeNull();
  });
});

/**
 * THE SAME PARCEL, THIRTY TIMES A SECOND.
 */
describe('a parcel held in front of the lens is received once', () => {
  it('suppresses the same code inside the window', () => {
    const recent = new RecentScans(2000);
    expect(recent.isRepeat('SY-1', 1000)).toBe(false);
    recent.accept('SY-1', 1000);
    expect(recent.isRepeat('SY-1', 1100)).toBe(true);
    expect(recent.isRepeat('SY-1', 2999)).toBe(true);
  });

  it('but NOT a different parcel — the packer alternating between two', () => {
    // The naive fix is "ignore it if it equals the last one", and this is
    // the case it loses: scan A, scan B, scan A again, and the third is
    // swallowed although it is a genuine second parcel.
    const recent = new RecentScans(2000);
    recent.accept('SY-1', 1000);
    expect(recent.isRepeat('SY-2', 1050)).toBe(false);
    recent.accept('SY-2', 1050);
    expect(recent.isRepeat('SY-1', 1100)).toBe(true);
  });

  it('and not the same parcel after the window — a re-scan is deliberate', () => {
    const recent = new RecentScans(2000);
    recent.accept('SY-1', 1000);
    expect(recent.isRepeat('SY-1', 3001)).toBe(false);
  });

  it('does not grow without bound while a shift runs', () => {
    const recent = new RecentScans(2000);
    for (let i = 0; i < 500; i++) recent.accept(`SY-${i}`, 1000 + i * 10);
    // Accepting prunes what can no longer matter; without that this map is
    // every code scanned in eight hours, held in a phone's memory.
    expect(recent.isRepeat('SY-0', 6000)).toBe(false);
  });
});

/**
 * WHICH DECODER THIS BROWSER GETS.
 *
 * Half a warehouse is on iPhones. A scanner that silently reads nothing on
 * those is worse than no scanner: the people it fails are told by their
 * colleagues that it works.
 */
describe('choosing a decoder', () => {
  it('uses the built-in one when it really supports QR', async () => {
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ['qr_code', 'code_128'];
      async detect() {
        return [];
      }
    };
    expect(await nativeScanningWorks()).toBe(true);
    const { native } = await makeReader();
    expect(native).toBe(true);
  });

  it('falls back when the constructor exists but supports no QR', async () => {
    // Real browsers do this. A detector that finds nothing looks exactly
    // like a camera pointed at the wrong thing, and nobody debugs it.
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ['pdf417'];
      async detect() {
        return [];
      }
    };
    expect(await nativeScanningWorks()).toBe(false);
  });

  it('falls back when asking which formats are supported throws', async () => {
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => {
        throw new Error('nope');
      };
      async detect() {
        return [];
      }
    };
    expect(await nativeScanningWorks()).toBe(false);
  });

  it('falls back on a browser without the API at all — every iPhone', async () => {
    expect(g.BarcodeDetector).toBeUndefined();
    expect(await nativeScanningWorks()).toBe(false);
  });
});

/**
 * OUR REFERENCE BEFORE THEIRS.
 *
 * Both codes are on the label, both are in frame. The courier's barcode can
 * belong to a shipment we have already replaced; our own reference cannot.
 */
describe('a label carries two codes', () => {
  it('reads the QR first and does not even look at the barcode', async () => {
    const seen: string[][] = [];
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ['qr_code'];
      constructor(private readonly opts: { formats: string[] }) {}
      async detect() {
        seen.push(this.opts.formats);
        return this.opts.formats.includes('qr_code')
          ? [{ rawValue: 'SY-2026-0148', format: 'qr_code' }]
          : [{ rawValue: 'LT999', format: 'code_128' }];
      }
    };
    const { reader } = await makeReader();
    const hit = await reader.read({} as CanvasImageSource);
    expect(hit).toEqual({ text: 'SY-2026-0148', format: 'qr' });
    expect(seen).toEqual([[...QR_FORMATS]]);
  });

  it("and reads the courier's barcode when there is no QR in frame", async () => {
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ['qr_code'];
      constructor(private readonly opts: { formats: string[] }) {}
      async detect() {
        return this.opts.formats.includes('qr_code') ? [] : [{ rawValue: 'LT999', format: 'code_128' }];
      }
    };
    const { reader } = await makeReader();
    expect(await reader.read({} as CanvasImageSource)).toEqual({ text: 'LT999', format: 'barcode' });
  });

  it('and says nothing at all on an empty frame', async () => {
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ['qr_code'];
      async detect() {
        return [];
      }
    };
    const { reader } = await makeReader();
    expect(await reader.read({} as CanvasImageSource)).toBeNull();
  });

  it('covers the linear formats a courier label actually uses', () => {
    expect([...BARCODE_FORMATS]).toContain('code_128');
    expect([...BARCODE_FORMATS]).toContain('code_39');
  });
});
