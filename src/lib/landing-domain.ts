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

/**
 * What a seller's hostname serves: the path its root rewrites to, and every
 * public path that belongs to it. A host is one seller's; the rest of the
 * public space — every other company's /lp and /s pages — is not served on
 * it (see proxy.ts).
 */
export interface HostSite {
  path: string;
  scope: string[];
}

interface Hit {
  site: HostSite | null;
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
export async function hostSite(host: string | null | undefined): Promise<HostSite | null> {
  const bare = normalizeHost(host);
  if (!bare) return null;

  const hit = cache.get(bare);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.site;

  let site: HostSite | null = null;
  try {
    const page = await db.landingPage.findFirst({
      where: { domain: bare, isPublished: true },
      select: { id: true, slug: true, createdAt: true },
    });
    if (page) {
      // A page whose slug an older page also holds is not what /lp/<slug>
      // renders — serving the host would show the OTHER page under it.
      const shadowed = await shadowedSlugs([page]);
      site = shadowed.has(page.slug) ? null : { path: `/lp/${page.slug}`, scope: [`/lp/${page.slug}`] };
    } else {
      const store = await db.store.findFirst({
        where: { domain: bare, storefrontEnabled: true, status: 'ACTIVE' },
        // The store's own published pages belong to its host too — a Single
        // Product front in uploaded HTML loads /lp/<slug>/raw into its frame.
        select: {
          slug: true,
          landingPages: { where: { isPublished: true }, select: { id: true, slug: true, createdAt: true } },
        },
      });
      if (store) {
        const pages = store.landingPages ?? [];
        const shadowed = await shadowedSlugs(pages);
        site = {
          path: `/s/${store.slug}`,
          scope: [`/s/${store.slug}`, ...pages.filter((p) => !shadowed.has(p.slug)).map((p) => `/lp/${p.slug}`)],
        };
      }
    }
  } catch {
    // A database that is briefly unreachable must not take the whole app
    // down with it: an unresolved host falls through to the app as before.
    return null;
  }

  cache.set(bare, { site, at: Date.now() });
  return site;
}

/**
 * The slugs of these pages that /lp/<slug> resolves to ANOTHER page.
 *
 * Slugs are one space for every company, but pages from before that rule
 * can share one, and /lp/<slug> renders the oldest published page holding
 * it. A host's scope is checked by path, so a shadowed slug in it would let
 * the seller's domain show another company's page.
 */
async function shadowedSlugs(pages: { id: string; slug: string; createdAt: Date }[]): Promise<Set<string>> {
  if (pages.length === 0) return new Set();
  const others = await db.landingPage.findMany({
    where: { slug: { in: pages.map((p) => p.slug) }, isPublished: true, id: { notIn: pages.map((p) => p.id) } },
    select: { slug: true, createdAt: true },
  });
  const shadowed = new Set<string>();
  for (const page of pages) {
    if (others.some((o) => o.slug === page.slug && o.createdAt <= page.createdAt)) shadowed.add(page.slug);
  }
  return shadowed;
}

/** The path a hostname's root rewrites to, or null. */
export async function pathForHost(host: string | null | undefined): Promise<string | null> {
  return (await hostSite(host))?.path ?? null;
}

/** Whether a public path is one of this host's own. */
export function inHostScope(site: HostSite, pathname: string): boolean {
  return site.scope.some((p) => pathname === p || pathname.startsWith(p + '/'));
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
export function validateDomain(
  input: string,
  /**
   * The hosts this request knows the dashboard by (see dashboardHosts).
   * Checked on every save, because APP_DOMAIN is optional and was unset in
   * the documented deploy: a seller could type the dashboard's hostname as
   * their page's domain, and the proxy then served their page in place of
   * the dashboard, for everyone. Headers can be forged by a determined
   * caller, which is why the configured APP_URL / APP_DOMAIN is the real
   * guard and these are the net under it.
   */
  requestHosts?: string | null | (string | null | undefined)[]
): { ok: true; domain: string } | { ok: false; error: string } {
  const bare = input.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

  if (!bare) return { ok: false, error: 'النطاق مطلوب' };
  if (bare.length > 253) return { ok: false, error: 'النطاق طويل أكثر من اللازم' };
  if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(bare)) {
    return { ok: false, error: 'اكتب النطاق وحده — مثال: shop.example.com' };
  }
  if (bare === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) {
    return { ok: false, error: 'هذا ليس نطاقاً يمكن توجيهه' };
  }

  const asked = Array.isArray(requestHosts) ? requestHosts : [requestHosts];
  const own = [
    normalizeHost(process.env.APP_DOMAIN),
    hostOfUrl(process.env.NEXT_PUBLIC_APP_URL),
    hostOfUrl(process.env.APP_URL),
    ...asked.map((h) => normalizeHost(h ?? null)),
  ].filter((h): h is string => !!h);
  if (own.some((h) => bare === h || bare.endsWith(`.${h}`))) {
    return { ok: false, error: 'لا يمكن استخدام نطاق النظام نفسه' };
  }

  return { ok: true, domain: bare };
}

/** The host of a configured URL, or null. */
function hostOfUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return normalizeHost(new URL(url).host);
  } catch {
    return null;
  }
}

/**
 * Every host a dashboard request names the dashboard by: the Host it
 * reached, the host a proxy forwarded, and the host of the page the request
 * was sent from (Origin, Referer). A domain equal to any of them is the
 * dashboard's own.
 */
export function dashboardHosts(req: Request): string[] {
  const h = req.headers;
  return [h.get('host'), h.get('x-forwarded-host'), hostOfUrl(h.get('origin') ?? undefined), hostOfUrl(h.get('referer') ?? undefined)]
    .filter((x): x is string => !!x);
}
