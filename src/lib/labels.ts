import { SignJWT, jwtVerify } from 'jose';

/**
 * LABELS — the print URL carries a signed BATCH TOKEN, never a list of order
 * ids: an id list in a URL is a readable index of someone's orders. The token
 * names the store and the orders; the server re-checks every order against
 * the session's company and store before rendering a single label.
 */

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('SECURITY: JWT_SECRET is required');
    return new TextEncoder().encode('development_only_insecure_jwt_secret_key_0000');
  }
  return new TextEncoder().encode(s);
}

export interface LabelBatch {
  storeId: string;
  orderIds: string[];
  /** Millimetres; the operator may pick a custom size. */
  width: number;
  height: number;
}

export async function signLabelBatch(batch: LabelBatch): Promise<string> {
  return new SignJWT({ kind: 'label_batch', ...batch })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret());
}

export async function verifyLabelBatch(token: string): Promise<LabelBatch | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== 'label_batch') return null;
    const orderIds = Array.isArray(payload.orderIds) ? (payload.orderIds as string[]) : [];
    if (typeof payload.storeId !== 'string' || orderIds.length === 0) return null;
    return {
      storeId: payload.storeId,
      orderIds,
      width: typeof payload.width === 'number' ? payload.width : 100,
      height: typeof payload.height === 'number' ? payload.height : 150,
    };
  } catch {
    return null;
  }
}

/** Label sizes in millimetres; "custom" is allowed via the API. */
/**
 * The papers a waybill is actually printed on.
 *
 * Thermal rolls first, because that is what a label printer holds; the A
 * sizes are for an ordinary office printer, where several labels share one
 * sheet. Sizes are in millimetres, portrait, and the print stylesheet sets
 * the page to exactly these.
 */
export const LABEL_SIZES = [
  { key: '100x150', label: '100×150 مم (حراري)', width: 100, height: 150 },
  { key: '100x100', label: '100×100 مم (حراري)', width: 100, height: 100 },
  { key: 'a6', label: 'A6 — 105×148 مم', width: 105, height: 148 },
  { key: 'a5', label: 'A5 — 148×210 مم', width: 148, height: 210 },
  { key: 'a4', label: 'A4 — 210×297 مم', width: 210, height: 297 },
] as const;

/**
 * Code 128B barcode as SVG paths — no runtime dependency, no external call.
 * Used for the courier barcode; our own reference is printed as a QR.
 */
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '233111',
];

/** Bar widths for a Code 128B barcode of `value` (module = 1 unit). */
export function code128Bars(value: string): number[] {
  const clean = value.replace(/[^\x20-\x7E]/g, '').slice(0, 40) || '0';
  const codes = [104]; // Start B
  let checksum = 104;
  [...clean].forEach((ch, i) => {
    const code = ch.charCodeAt(0) - 32;
    codes.push(code);
    checksum += code * (i + 1);
  });
  codes.push(checksum % 103);
  codes.push(106); // Stop

  const bars: number[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] ?? CODE128_PATTERNS[0];
    for (const width of pattern) bars.push(Number(width));
  }
  return bars;
}
