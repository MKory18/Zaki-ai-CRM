import { db } from '../db';
import { normalizePhone } from '../conversions/hash';
import { ruleFor } from '../phone-rules';
import { decryptSecret, encryptSecret, encryptionAvailable } from '../secrets';

/**
 * THE SEALED REFERENCE AN ORDER CARRIES, AND WHAT OPENS IT.
 *
 * The media buyer sends server-side conversions to Meta (its `capi.send`).
 * To match the person who bought to the person who saw the ad, Meta wants a
 * phone and the click ids — and the media buyer must not be given those with
 * every page of orders it reads. So an order's attribution row carries only
 * `capi_ref`, an OPAQUE reference, and the identifiers sit behind a second
 * door (`POST /api/v1/capi/identifiers`, scope `capi.identifiers`) that opens
 * a reference in memory, answers, and forgets.
 *
 * ── WHAT A REFERENCE IS ──
 *
 * `enc:` + base64url of the same AES-256-GCM blob a courier password is kept
 * in (`secrets.ts`), over `<companyId>|<orderId>`. It says nothing a reader
 * can use, and it cannot be forged without the server's key. The company is
 * inside it so a reference minted for one company opens for no other: the
 * door checks it against the TOKEN's company, never the request's.
 *
 * ── AND NOTHING HERE LOGS A VALUE ──
 *
 * A phone, a click id or a chat account is read, handed to the caller and
 * dropped. A reference that will not open is skipped without a word — not an
 * error naming it, not a log line — because «this one is not yours» and
 * «this one is garbage» must look the same from outside.
 */

const SEP = '|';

/** At most this many references in one call — a CAPI batch, not a customer list. */
export const MAX_REFS = 100;

/** The reference for an order, or null when this server has no encryption key. */
export function mintCapiRef(companyId: string, orderId: string): string | null {
  if (!encryptionAvailable()) return null;
  try {
    return 'enc:' + Buffer.from(encryptSecret(`${companyId}${SEP}${orderId}`), 'utf8').toString('base64url');
  } catch {
    return null;
  }
}

/** The order a reference names — only for the company it was minted for. Anything else is null. */
export function openCapiRef(ref: string, companyId: string): string | null {
  if (!ref.startsWith('enc:')) return null;
  try {
    const plain = decryptSecret(Buffer.from(ref.slice(4), 'base64url').toString('utf8'));
    const at = plain.indexOf(SEP);
    if (at < 1) return null;
    const refCompany = plain.slice(0, at);
    const orderId = plain.slice(at + 1);
    return refCompany === companyId && orderId ? orderId : null;
  } catch {
    return null;
  }
}

/** A sealed column opened, or null — never a throw, never a log. */
function unseal(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    return decryptSecret(blob);
  } catch {
    return null;
  }
}

export interface CapiIdentifiers {
  ref: string;
  phone_e164: string | null;
  fbc: string | null;
  fbp: string | null;
  external_ref: string | null;
  ctwa_clid: string | null;
  waba_id: string | null;
  page_id: string | null;
  psid: string | null;
}

/**
 * The identifiers for each reference that opens, in the order they were asked.
 * A reference that does not open (garbage, another company's, an order since
 * deleted) is simply absent from the answer.
 */
export async function readCapiIdentifiers(companyId: string, refs: readonly string[]): Promise<CapiIdentifiers[]> {
  const orderIds = new Set<string>();
  for (const ref of refs) {
    const orderId = openCapiRef(ref, companyId);
    if (orderId) orderIds.add(orderId);
  }
  if (orderIds.size === 0) return [];

  const orders = await db.order.findMany({
    // The company is the token's, again: a reference is not trusted for it.
    where: { companyId, id: { in: [...orderIds] } },
    select: {
      id: true,
      customerId: true,
      ctwaClidEnc: true,
      psidEnc: true,
      pageId: true,
      wabaId: true,
      fbcEnc: true,
      fbpEnc: true,
      customer: { select: { phone: true, rawPhone: true, country: true } },
      store: { select: { country: { select: { code: true } } } },
    },
  });

  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const out: CapiIdentifiers[] = [];
  for (const ref of refs) {
    const orderId = openCapiRef(ref, companyId);
    const o = orderId ? byOrder.get(orderId) : undefined;
    if (!o) continue;
    // The country's own dial code — the store's, else the customer's. With
    // neither known there is no honest way to complete a local number, so it
    // is not guessed: no phone is better than a wrong one.
    const dial = ruleFor(o.store?.country?.code)?.dialCode ?? ruleFor(o.customer?.country)?.dialCode ?? null;
    const digits = dial ? normalizePhone(o.customer?.phone || o.customer?.rawPhone, dial) : null;
    out.push({
      ref,
      phone_e164: digits ? `+${digits}` : null,
      fbc: unseal(o.fbcEnc),
      fbp: unseal(o.fbpEnc),
      external_ref: o.customerId,
      ctwa_clid: unseal(o.ctwaClidEnc),
      waba_id: o.wabaId ?? null,
      page_id: o.pageId ?? null,
      psid: unseal(o.psidEnc),
    });
  }
  return out;
}
