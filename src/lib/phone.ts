import { canonicalPhone, ruleFor } from './phone-rules';

/**
 * PHONE STORAGE — one canonical form for the whole system.
 *
 * This function used to carry its own rules, and they were Egypt's: it knew
 * the +20 prefix and the 010/011/012/015 mobile heads, and nothing else. The
 * blacklist meanwhile matched on canonicalPhone, which knows Syria, Jordan,
 * Saudi Arabia, the Emirates and Iraq.
 *
 * Two functions, two answers, one number. A Syrian customer typed as
 * +963966793918 was stored as 963966793918 while the same person typed as
 * 0966793918 was stored as 0966793918 — and the data proved it: the same
 * man existed twice under both spellings. Worse, a number on the blacklist
 * was searched for in a form the customer table never used, so a blocked
 * number could walk straight through.
 *
 * Every call site keeps this name; there is one implementation behind it.
 * The number as the customer typed it is never lost — it is kept in
 * `rawPhone` and shown back to them.
 */
export function normalizePhoneNumber(phone: string): string {
  return canonicalPhone(phone);
}

/**
 * The number as a person reads it, for the country it belongs to.
 *
 * Storage drops the trunk zero and the dial code; a human expects them back.
 * Without a country to judge by, the number is returned untouched rather
 * than dressed in another country's shape.
 */
export function formatPhoneNumber(phone: string, countryCode?: string | null): string {
  const canonical = canonicalPhone(phone);
  if (!canonical) return phone;

  // Every country the rules know writes the national number behind a single
  // trunk zero; without a known country the number is left as typed.
  if (!ruleFor(countryCode)) return phone;
  return `0${canonical}`;
}
