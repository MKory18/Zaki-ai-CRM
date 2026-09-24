/**
 * THE PLACE LINE ON A WAYBILL, WITH THE GOVERNORATE ONCE.
 *
 * Most stored addresses in this system came from a courier's own statement,
 * which writes an address as "<governorate> - <city> <street>" — and for a
 * parcel to a governorate's main city the city has the same name, so the
 * text arrives as «طرطوس - طرطوس بانياس.». The waybill then put our region
 * in front of it, and the driver read «طرطوس — طرطوس - طرطوس بانياس.».
 * Telegram intake can store the governorate AS the address when none was
 * given, which printed «حلب — حلب».
 *
 * This does not touch the stored address. The address lives on the shared
 * customer row with no per-order copy, so rewriting it would change what
 * every past order of that customer prints; and whether to clean history is
 * the owner's decision, not a printing side effect.
 *
 * Only LEADING repetitions are removed. A governorate later in the text is
 * usually meaning, not noise — «شمالي حلب» is "north of Aleppo", and
 * stripping it would send a parcel to «شمالي».
 *
 * Pure: the label renderer and its tests call it.
 */

/**
 * The same name, written the ways people and couriers write it.
 *
 * «ادلب» and «إدلب» are one governorate; so are «حماة» and «حماه», and
 * diacritics or a stretched letter change nothing. Comparison only — the
 * printed text keeps its own spelling.
 */
export function sameArabicName(a: string, b: string): boolean {
  return fold(a) !== '' && fold(a) === fold(b);
}

function fold(s: string): string {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '') // harakat, dagger alef, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** A separator between parts of an address: a dash, comma or slash, with any spacing. */
const SEPARATOR = /^[\s\-–—،,/|]+/;

/**
 * The address with every leading copy of `governorate` removed.
 *
 * Works word by word so a multi-word name («ريف دمشق», «دير الزور») is
 * matched whole, and only ever at the start of what is left.
 */
export function stripLeadingGovernorate(address: string, governorate: string): string {
  const gov = fold(governorate);
  if (!gov) return String(address ?? '').trim();

  const govWords = gov.split(' ').length;
  let rest = String(address ?? '').trim();

  for (;;) {
    const words = rest.split(/\s+/);
    // Candidate: the first N words, ignoring a separator glued to the last one.
    const head = words.slice(0, govWords).join(' ').replace(/[\s\-–—،,/|.]+$/, '');
    if (!head || fold(head) !== gov) break;

    // Drop exactly the characters those words occupied, then any separator.
    let consumed = 0;
    let seen = 0;
    while (seen < govWords && consumed < rest.length) {
      const m = /^\S+\s*/.exec(rest.slice(consumed));
      if (!m) break;
      consumed += m[0].length;
      seen++;
    }
    const next = rest.slice(consumed).replace(SEPARATOR, '').trim();
    if (next === rest) break;
    rest = next;
  }
  return rest;
}

/**
 * "<governorate> — <the rest of the address>", the governorate said once.
 *
 * The governorate is the order's region when it has one, otherwise the
 * customer's city. When the address is nothing but the governorate — the
 * Telegram case — the line is just the governorate.
 */
export function placeLine(region: string | null | undefined, city: string | null | undefined, address: string | null | undefined): string {
  const gov = String(region ?? '').trim() || String(city ?? '').trim();
  const addr = String(address ?? '').trim();
  if (!gov) return addr;

  const rest = stripLeadingGovernorate(addr, gov);
  // What is left must say something: a run of dashes is not an address.
  return /[\p{L}\p{N}]/u.test(rest) ? `${gov} — ${rest}` : gov;
}
