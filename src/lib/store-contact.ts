/**
 * REACHING THE SHOP — the shopper's direction.
 *
 * NOT `ContactButtons`. That one is for STAFF reaching a CUSTOMER about an
 * order: it fills a ready-made template with the order's number, the
 * customer's name and the amount, and it records the attempt. A shopper
 * has no order, no session and nothing to record an attempt against —
 * every single input that component needs is absent out here.
 *
 * So the two directions are two owners, and this is the shopper's. One
 * place the shop's own WhatsApp link is built, so the digits rule below
 * is decided once.
 */

/**
 * The shop's WhatsApp, or null when there is no number to reach.
 *
 * DIGITS ONLY, and the leading `+` goes too: `wa.me` takes an
 * international number with no punctuation at all, and a link built from
 * «+963 11 222 3333» as typed opens nothing — which looks to a shopper
 * exactly like a shop that does not answer.
 *
 * Null rather than a dead link: a button that opens nothing is worse than
 * no button, and the caller can leave it out.
 */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  // Shorter than this is not a reachable number anywhere we sell.
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

/**
 * The same number as something to dial.
 *
 * The `+` SURVIVES here, and that is the difference from above: a phone
 * app needs it to know the number is international, and a customer
 * roaming or on another country's network gets a failed call without it.
 */
export function telHref(phone: string | null | undefined): string | null {
  const cleaned = (phone ?? '').replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 6 ? `tel:${cleaned}` : null;
}
