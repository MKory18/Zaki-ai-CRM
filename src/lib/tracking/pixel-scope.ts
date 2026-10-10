import { db } from '@/lib/db';

/**
 * WHOSE VISITORS A PIXEL MAY BE TOLD ABOUT — validated at the ONE door, for
 * the create route and the edit route both.
 *
 * ── WHAT THIS ACTUALLY DEFENDS ──
 *
 * A pixel id is harmless; a FOREIGN KEY from the request body is not. Both
 * `storeId` and `countryId` arrive from a browser, and a store id belonging
 * to another company would otherwise be written straight into the column —
 * the foreign key would accept it (it is a real store) and the pixel would
 * then fire on somebody else's shop and report their sales to this
 * company's ad account. So each one is looked up WITH the company before it
 * is allowed anywhere near the row.
 *
 * ── AND THE TWO ARE MUTUALLY EXCLUSIVE ──
 *
 * A row naming both is two answers to one question: if the store is not in
 * that country, which decides? Refused here and refused again by a database
 * CHECK, because the route is one writer and the constraint is every
 * writer.
 */
export type PixelScopeInput = {
  storeId?: string | null;
  countryId?: string | null;
};

export type PixelScopeResult =
  | { ok: true; storeId: string | null; countryId: string | null }
  | { ok: false; error: string };

export async function resolvePixelScope(
  companyId: string,
  input: PixelScopeInput
): Promise<PixelScopeResult> {
  // An empty string from a `<select>` whose first option is «كل المتاجر» is
  // «none», not an id. Normalised here so neither route has to remember.
  const storeId = input.storeId?.trim() || null;
  const countryId = input.countryId?.trim() || null;

  if (storeId && countryId) {
    return { ok: false, error: 'اختر متجراً واحداً أو بلداً واحداً — لا الاثنين' };
  }

  if (storeId) {
    const store = await db.store.findFirst({ where: { id: storeId, companyId }, select: { id: true } });
    if (!store) return { ok: false, error: 'المتجر غير موجود في شركتك' };
    return { ok: true, storeId: store.id, countryId: null };
  }

  if (countryId) {
    const country = await db.country.findFirst({ where: { id: countryId, companyId }, select: { id: true } });
    if (!country) return { ok: false, error: 'البلد غير موجود في شركتك' };
    return { ok: true, storeId: null, countryId: country.id };
  }

  // Neither: the company's own, everywhere it sells. A deliberate choice the
  // screen names out loud — not the shape a forgotten field takes.
  return { ok: true, storeId: null, countryId: null };
}
