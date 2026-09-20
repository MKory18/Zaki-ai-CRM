/**
 * Resolving a written city or governorate to a Region row.
 *
 * Orders arrive from a pasted message, a sheet, a landing page and a
 * Telegram bot, and each one carries the place as free text. The delivery
 * fee is keyed on regionId, so an order that never resolves its region can
 * never be priced or shipped — it sits in the shipment screen saying "no
 * region" while the city is written plainly on the customer.
 *
 * One matcher, used by every intake path, so they cannot drift apart.
 */

type RegionRow = { id: string; name: string };

/** Anything with a Prisma-shaped `region.findMany` — the client or a tx. */
type RegionFinder = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  region: { findMany: (args: any) => Promise<RegionRow[]> };
};

/** Arabic writes the same place several ways; compare on a flattened form. */
export function normalizePlace(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('ar')
    .replace(/[ً-ْـ]/g, '')       // harakat and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    // NOT ريف: "ريف دمشق" is a governorate in its own right, not a prefix.
    .replace(/^(?:محافظة|محافظه|مدينة|مدينه)\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best region for a written place, or null.
 *
 * Exact match first, then a containment match in either direction, which is
 * what catches "ريف دمشق - ريف دمشق بلدة معربا" against "ريف دمشق" and
 * "عمان الغربية" against "عمّان". Never guesses between two equally good
 * candidates: ambiguity returns null so a human picks.
 */
export function matchRegion(regions: RegionRow[], place: string | null | undefined): RegionRow | null {
  if (!place) return null;
  const needle = normalizePlace(place);
  if (!needle) return null;

  const normalized = regions.map((r) => ({ row: r, key: normalizePlace(r.name) }));

  const exact = normalized.filter((r) => r.key === needle);
  if (exact.length === 1) return exact[0].row;
  if (exact.length > 1) return null;

  // Containment, longest region name first so "ريف دمشق" beats "دمشق".
  const contained = normalized
    .filter((r) => r.key.length > 1 && (needle.includes(r.key) || r.key.includes(needle)))
    .sort((a, b) => b.key.length - a.key.length);

  if (contained.length === 0) return null;
  if (contained.length > 1 && contained[0].key.length === contained[1].key.length) return null; // tie → a human decides
  return contained[0].row;
}

/** Looks the country's regions up, then matches. Returns the id or null. */
export async function resolveRegionId(
  tx: RegionFinder,
  countryId: string,
  place: string | null | undefined
): Promise<string | null> {
  if (!place?.trim()) return null;
  const regions = await tx.region.findMany({
    where: { countryId, isActive: true },
    select: { id: true, name: true },
  });
  return matchRegion(regions, place)?.id ?? null;
}
