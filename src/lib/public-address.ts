/**
 * THE ADDRESS A SELLER MAY HAND TO A CUSTOMER — WORKED OUT ONCE.
 *
 * Four screens built this string for themselves, and they did not agree:
 *
 *   - the landing page list and the page's own screen pasted
 *     `origin + /lp/<slug>` and IGNORED the page's custom domain entirely,
 *     so a seller who had connected one was still handed the internal
 *     address and concluded the domain had done nothing;
 *   - the storefront card used `https://<domain>` the moment a domain was
 *     typed, WITHOUT asking whether it had ever resolved — so «انسخ الرابط»
 *     put a dead hostname into an advertisement, and every paid click on it
 *     reached a browser error instead of the shop.
 *
 * Both halves of that are the same missing rule, so there is one rule:
 *
 *   A CUSTOM DOMAIN IS THE ADDRESS ONLY ONCE A REAL LOOKUP HAS PASSED.
 *   Until then the internal address is the address, and the screen says
 *   the domain is not ready — rather than offering a link that is a guess.
 *
 * The seller's host serves the page at its ROOT: the proxy rewrites `/` to
 * `/lp/<slug>` or `/s/<slug>` (see proxy.ts), so the address on a connected
 * domain carries no path. Appending one — `https://shop.com/lp/x` — is a
 * 404 on the seller's own domain, because a host answers only for its own
 * scope.
 *
 * Pure: no DB, no window, no fetch. The screens pass what they already hold,
 * so the API and the UI cannot drift apart.
 */

export type AddressSource = 'DOMAIN' | 'APP';

export interface AddressTarget {
  /** A landing page answers at /lp/<slug>; a storefront at /s/<slug>. */
  kind: 'lp' | 'store';
  slug: string;
  /** The custom domain, as stored. */
  domain?: string | null;
  /** When a real DNS + TLS lookup last passed. Null means never. */
  domainVerifiedAt?: string | Date | null;
}

export interface PublicAddress {
  /** The one link to copy, to print and to paste into an advertisement. */
  url: string;
  /** The internal path this page answers at, always. */
  path: string;
  source: AddressSource;
  /**
   * A domain that is connected but is NOT the address yet, with the reason
   * in the seller's language. Null when there is nothing to withhold.
   */
  pending: { domain: string; reason: string } | null;
}

/** The internal path — the one address that is true whatever DNS says. */
export function publicPath(target: Pick<AddressTarget, 'kind' | 'slug'>): string {
  return target.kind === 'lp' ? `/lp/${target.slug}` : `/s/${target.slug}`;
}

/**
 * Whether a connected domain has earned the right to be the address.
 *
 * A blank domain, and a domain with no verification behind it, both read as
 * "not yet" — and they are different messages, because only one of them is
 * something the seller is waiting on.
 */
export function domainIsLive(target: Pick<AddressTarget, 'domain' | 'domainVerifiedAt'>): boolean {
  return !!target.domain?.trim() && !!target.domainVerifiedAt;
}

/**
 * The address, and what is being withheld.
 *
 * `origin` is where this app answers — `window.location.origin` in a screen,
 * a configured URL on the server. An empty one yields the bare path rather
 * than a URL with `undefined` in it: a path is still copyable and still
 * true, which a broken absolute URL is not.
 */
export function publicAddress(origin: string | null | undefined, target: AddressTarget): PublicAddress {
  const path = publicPath(target);
  const base = (origin ?? '').trim().replace(/\/+$/, '');
  // No ternary on `base`: an empty one already yields the bare path, and the
  // branch that said so was a second way of writing the same thing — an
  // untestable line, which is a line nobody can prove.
  const internal = `${base}${path}`;
  const domain = target.domain?.trim() || null;

  if (domain && target.domainVerifiedAt) {
    return { url: `https://${domain}`, path, source: 'DOMAIN', pending: null };
  }

  return {
    url: internal,
    path,
    source: 'APP',
    pending: domain
      ? {
          domain,
          reason: 'النطاق مربوط لكنه لم يُتحقَّق بعد — لا تنشر هذا العنوان قبل أن يصبح «متحقَّق»، فقد لا يفتح عند الزبون.',
        }
      : null,
  };
}
