/**
 * READING A CODE OFF A LABEL — ON BOTH KINDS OF PHONE.
 *
 * `BarcodeDetector` is built into Chrome on Android and reads a frame in
 * microseconds. Safari does not have it, on any iPhone, and is not going
 * to: a scanner built on it alone works for half a warehouse and fails
 * silently for the other half, which is worse than not shipping it — the
 * people it fails are told by their colleagues that it works.
 *
 * So: native where it exists, ZXing where it does not, behind one function
 * that answers the same question either way. The decision is made once, at
 * the start of a scanning session, not per frame.
 *
 * QR FIRST. Our own reference is the QR; the courier's barcode is beside
 * it. When both are in frame — which is every label — reading the QR first
 * means the scan resolves to OUR order rather than to a courier's number
 * that may belong to a shipment we have already replaced.
 */

/** What a scan produced, and which symbology it came from. */
export interface ScanHit {
  text: string;
  format: 'qr' | 'barcode';
}

/** Ours first, then the linear formats a courier label carries. */
export const QR_FORMATS = ['qr_code'] as const;
export const BARCODE_FORMATS = ['code_128', 'code_39', 'ean_13', 'itf'] as const;

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]>;
};

interface NativeCtor {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

function nativeCtor(): NativeCtor | null {
  const w = globalThis as unknown as { BarcodeDetector?: NativeCtor };
  return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : null;
}

/**
 * Can this browser read codes without a library?
 *
 * Asked rather than assumed: the constructor exists in some browsers that
 * then support no formats at all, and a detector that finds nothing looks
 * exactly like a camera pointed at the wrong thing.
 */
export async function nativeScanningWorks(): Promise<boolean> {
  const Ctor = nativeCtor();
  if (!Ctor) return false;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? [];
    return formats.includes('qr_code');
  } catch {
    return false;
  }
}

export interface Reader {
  /** One frame in, at most one hit out. */
  read: (frame: CanvasImageSource) => Promise<ScanHit | null>;
  /** Let go of whatever the reader is holding. */
  close: () => void;
}

/** The native path. */
async function nativeReader(): Promise<Reader> {
  const Ctor = nativeCtor()!;
  const qr = new Ctor({ formats: [...QR_FORMATS] });
  const bars = new Ctor({ formats: [...BARCODE_FORMATS] });

  return {
    async read(frame) {
      // QR first, always — see the note at the top of this file.
      const ours = await qr.detect(frame).catch(() => []);
      if (ours.length > 0) return { text: ours[0].rawValue, format: 'qr' };
      const theirs = await bars.detect(frame).catch(() => []);
      if (theirs.length > 0) return { text: theirs[0].rawValue, format: 'barcode' };
      return null;
    },
    close() {
      /* nothing to release */
    },
  };
}

/**
 * The library path — every iPhone, and any Android without the API.
 *
 * Loaded on demand. It is a few hundred kilobytes, and a moderator who
 * never scans should not download a decoder to look at a list.
 */
async function libraryReader(): Promise<Reader> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.ITF,
  ]);
  const reader = new BrowserMultiFormatReader(hints);

  return {
    async read(frame) {
      // ZXing decodes from a canvas element; the caller draws the frame.
      const canvas = frame as HTMLCanvasElement;
      try {
        const result = reader.decodeFromCanvas(canvas);
        const text = result.getText();
        return {
          text,
          format: result.getBarcodeFormat() === BarcodeFormat.QR_CODE ? 'qr' : 'barcode',
        };
      } catch {
        // NotFoundException on most frames — that is the normal case, not
        // an error worth surfacing.
        return null;
      }
    },
    close() {
      // Present on the browser reader; guarded because the type does not
      // promise it across versions.
      (reader as unknown as { reset?: () => void }).reset?.();
    },
  };
}

/** The reader this browser can actually use. */
export async function makeReader(): Promise<{ reader: Reader; native: boolean }> {
  if (await nativeScanningWorks()) {
    return { reader: await nativeReader(), native: true };
  }
  return { reader: await libraryReader(), native: false };
}

/**
 * THE SAME LABEL, TWICE, IN THE SAME SECOND.
 *
 * A camera reads thirty frames a second and a parcel sits in front of it
 * for two. Without this, one parcel is received fifteen times: fifteen
 * requests, fifteen sounds, and a batch count nobody believes.
 *
 * Keyed by the code, not by "the last one": a packer alternating between
 * two parcels must not have the second one swallowed because the first is
 * still the most recent.
 */
export class RecentScans {
  private seen = new Map<string, number>();

  constructor(private readonly windowMs = 2000) {}

  /** True when this code was already accepted inside the window. */
  isRepeat(text: string, now = Date.now()): boolean {
    const at = this.seen.get(text);
    return at !== undefined && now - at < this.windowMs;
  }

  accept(text: string, now = Date.now()): void {
    this.seen.set(text, now);
    // Nothing older than the window can ever matter again.
    for (const [code, when] of this.seen) {
      if (now - when >= this.windowMs) this.seen.delete(code);
    }
  }

  clear(): void {
    this.seen.clear();
  }
}

/**
 * WHAT A SCANNED STRING IS ALLOWED TO BE.
 *
 * A code read off a label is untrusted input: it arrives from a camera
 * pointed at a piece of paper anybody could have printed. It is used to
 * SEARCH, never to address a record directly, and this is the shape it
 * must have before it is even sent.
 *
 * Deliberately narrow: letters, digits and dashes, and short. A payload
 * carrying a URL, a JSON blob or a phone number is not one of our labels,
 * and refusing it here means it never reaches a query.
 */
export function cleanScan(raw: string): string | null {
  const text = raw.trim();
  if (text.length < 3 || text.length > 40) return null;
  if (!/^[A-Za-z0-9-]+$/.test(text)) return null;
  return text.toUpperCase();
}
