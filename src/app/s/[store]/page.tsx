import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getStorefront, storefrontProducts } from '@/lib/storefront';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';

/**
 * A store's front door — no login, no session, no cookies.
 *
 * A shop that sells one thing sends you straight to that thing: making a
 * visitor click "products" to reach the only product is a step that exists
 * for the software's convenience, not theirs. A shop with many lists them.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ store: string }>;
}

export default async function StorefrontHome({ params }: Props) {
  const { store: slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();

  const store = await getStorefront(slug);
  if (!store) notFound();

  const products = await storefrontProducts(store.companyId);

  // One product for sale, one page. Redirect rather than render a grid of
  // one, so the address a customer shares is the product's own.
  if (store.type === 'SINGLE_PRODUCT' && products.length === 1) {
    redirect(`/s/${store.slug}/p/${products[0].sku}`);
  }

  const money = (n: number) =>
    `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${store.currencyCode}`;

  return (
    <StorefrontShell store={store}>
      <section className="sf-hero">
        <h1>{store.tagline || store.name}</h1>
        {store.about && <p>{store.about}</p>}
      </section>

      {products.length === 0 ? (
        <p className="sf-empty">لا منتجات معروضة حالياً.</p>
      ) : (
        <div className="sf-grid-wrap">
          <div className="sf-grid">
            {products.map((p) => (
              <Link key={p.id} href={`/s/${store.slug}/p/${p.sku}`} className="sf-card">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.name} className="sf-card-img" loading="lazy" />
                ) : (
                  <span className="sf-card-none" aria-hidden />
                )}
                <span className="sf-card-body">
                  <span className="sf-card-name">{p.name}</span>
                  <span className="sf-card-price" dir="ltr">
                    {/* The cheapest per unit across its bundles — the number a
                        shopper compares, computed from the offers the order
                        path charges from. */}
                    {p.fromPrice < p.basePrice && <small>من </small>}
                    {money(p.fromPrice)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </StorefrontShell>
  );
}
