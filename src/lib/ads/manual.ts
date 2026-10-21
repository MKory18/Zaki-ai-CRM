/**
 * AN AD ACCOUNT WITH NOTHING CONNECTED TO IT — «ادخال يدوي بالكامل».
 *
 * The owner, 21/10: «الحساب الاعلاني سواء ع فيس تكتوك سناب … اوتوماتيك او
 * ادخال يدوي بالكامل. اريد الخيارين». Until now an ad account could only
 * exist as a CONNECTION: a token that was checked against the platform,
 * encrypted, and read back every night by the sync. A seller who did not want
 * to hand a token over — or whose platform has no app registered for sign-in
 * — still had campaigns and still typed their spend, but had no ad account to
 * put them under, so «which account did this cost come out of» had no answer.
 *
 * A manual account is the same row without the connection: a platform, a
 * name to tell it apart by, and optionally the platform's own id. No token,
 * no call out, no sync. Its campaigns keep the spend the seller types, which
 * is what `Campaign.spendSource = 'MANUAL'` has always meant.
 *
 * ── ONE FIELD SAYS WHICH, AND THE DATABASE HOLDS IT ──
 *
 * `status` is CONNECTED | ERROR | MANUAL. It is the whole discriminator —
 * there is no second `mode` column, because two columns that must agree are a
 * pair that eventually does not. And the pairing with the token is a CHECK in
 * the migration, `("status" = 'MANUAL') = ("token_encrypted" IS NULL)`: a
 * manual account cannot be holding a stale secret nobody remembers to rotate,
 * and a connected one cannot be missing the token the sync will try to read.
 *
 * Isomorphic on purpose — no `node:` import — because the settings card, a
 * client component, asks `isManualAccount` the same question the routes do.
 *
 * ── WHAT THE SYNC AND THE IMPORT MAY TOUCH ──
 *
 * Only accounts with a platform on the other end. `WITH_A_PLATFORM` is the
 * one `where` fragment that says so, and both of them carry it — a manual
 * account that reached either would be decrypted (it has nothing to decrypt)
 * and called out to (it has nowhere to call).
 */

export const MANUAL_STATUS = 'MANUAL';

/** The `where` fragment for «an account a sync or an import may call». */
export const WITH_A_PLATFORM = { status: { not: MANUAL_STATUS } } as const;

export function isManualAccount(account: { status: string }): boolean {
  return account.status === MANUAL_STATUS;
}

/**
 * An id for an account whose platform id the seller did not give.
 *
 * `accountId` is part of the row's unique key, so it cannot be empty, and
 * inventing one that LOOKS like a platform's (`act_…`) would invite somebody
 * to paste it into Ads Manager. The prefix says what it is; eight hex digits
 * are four billion, plenty for one shop's handful of accounts.
 */
export const MANUAL_ID_PREFIX = 'manual-';

export function newManualAccountId(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return MANUAL_ID_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** An id this module made, as opposed to one a platform gave. */
export function isMadeUpAccountId(accountId: string): boolean {
  return accountId.startsWith(MANUAL_ID_PREFIX);
}

/**
 * WHAT AN ACCOUNT LOOKS LIKE THE MOMENT IT STOPS BEING CONNECTED.
 *
 * Written once, spread by the route, and checked against the migration's
 * CHECK: the token is gone (not hidden — gone), its hint with it, the status
 * says so, and a platform's error from the last failed night is cleared
 * because it described a connection that no longer exists.
 */
export const DISCONNECTED = {
  tokenEncrypted: null,
  tokenHint: null,
  status: MANUAL_STATUS,
  lastError: null,
} as const;

/** What the seller is told after switching an account to manual. */
export function switchedToManualMessage(campaigns: number): string {
  return campaigns > 0
    ? `صار الحساب يدوياً: حُذف الرمز، و${campaigns} حملة باقية فيه وإنفاقها بيدك من الآن. الأرقام المسحوبة قبل ذلك باقية كما هي — هي مصروف حقيقي.`
    : 'صار الحساب يدوياً: حُذف الرمز.';
}
