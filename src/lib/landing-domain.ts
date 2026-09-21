import { db } from './db';

/**
 * RESOLVING A HOSTNAME TO A LANDING PAGE.
 *
 * A seller points their own domain at this app; the proxy has to turn that
 * hostname into a page on every request. A database query per request would
 * put Postgres in front of every image and every asset, so the answer is
 * cached in the server's memory — including the answer "no", because the
 * host that asks most often is the app's own, and it is never a page.
 *
 * The cache is deliberately short. A domain is added at the moment someone
 * is waiting to see whether it works, and a minute of confusion is the whole
 * price of not asking the database sixty times a second.
 */

/** Where a hostname points, as a path to rewrite to. */
interface Hit {
  path: string | null;
  at: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, Hit>();

/** Strip the port and the case; DNS is case-insensitive and hosts carry ports. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const bare = host.trim().toLowerCase().split(':')[0];
  if (!bare || bare === 'localhost' || bare.endsWith('.localhost')) return null;
  // An IP address is the app being reached directly, never a seller's domain.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.startsWith('[')) return null;
  return bare;
}

/**
 * What this hostname serves, as the path to rewrite to — or null.
 *
 * A host can point at a landing page or at a whole storefront. Only a
 * PUBLISHED page and an ENABLED storefront answer: a draft on a live domain
 * would show a customer something its owner has not released.
 *
 * The landing page is checked first. The two are unique in their own tables
 * and the settings screens refuse a host the other already holds, so a
 * collision means somebody reached the database directly — and answering
 * with the more specific of the two is the safer way to be wrong.
 */
export async function pathForHost(host: string | null | undefined): Promise<string | null> {
  const bare = normalizeHost(host);
  if (!bare) return null;

  const hit = cache.get(bare);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.path;

  let path: string | null = null;
  try {
    const page = await db.landingPage.findFirst({
      where: { domain: bare, isPublished: true },
      select: { slug: true },
    });
    if (page) {
      path = `/lp/${page.slug}`;
    } else {
      const store = await db.store.findFirst({
        where: { domain: bare, storefrontEnabled: true, status: 'ACTIVE' },
        select: { slug: true },
      });
      if (store) path = `/s/${store.slug}`;
    }
  } catch {
    // A database that is briefly unreachable must not take the whole app
    // down with it: an unresolved host falls through to the app as before.
    return null;
  }

  cache.set(bare, { path, at: Date.now() });
  return path;
}

/** Forget a host, so a domain just saved or removed takes effect at once. */
export function forgetHost(host: string | null | undefined): void {
  const bare = normalizeHost(host);
  if (bare) cache.delete(bare);
}

/**
 * Is this a hostname a seller may claim?
 *
 * Rejects anything that is not a plain domain name, and anything under the
 * app's own host — claiming that would put a seller's page where the
 * dashboard lives, for everyone.
 */
export function validateDomain(input: string): { ok: true; domain: string } | { ok: false; error: string } {
  const bare = input.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

  if (!bare) return { ok: false, error: 'النطاق مطلوب' };
  if (bare.length > 253) return { ok: false, error: 'النطاق طويل أكثر من اللازم' };
  if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(bare)) {
    return { ok: false, error: 'اكتب النطاق وحده — مثال: shop.example.com' };
  }
  if (bare === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) {
    return { ok: false, error: 'هذا ليس نطاقاً يمكن توجيهه' };
  }

  const appHost = normalizeHost(process.env.APP_DOMAIN);
  if (appHost && (bare === appHost || bare.endsWith(`.${appHost}`))) {
    return { ok: false, error: 'لا يمكن استخدام نطاق النظام نفسه' };
  }

  return { ok: true, domain: bare };
}
