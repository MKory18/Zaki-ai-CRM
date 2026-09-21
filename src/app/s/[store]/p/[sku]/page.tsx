import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getStorefront, storefrontProduct } from '@/lib/storefront';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import { OfferCards } from '@/components/landing/blocks/OfferCards';
import { LandingFormBridge } from '@/components/landing/LandingFormBridge';
import OrderForm from '@/components/landing/OrderForm';
import { ruleFor } from '@/lib/phone-rules';

/**
 * A product, in a store, orderable.
 *
 * Every piece here already existed: the offer cards from the block builder,
 * the trusted order form from the landing page, the offers from the product.
 * A storefront that grew its own copy of any of them would be a second place
 * for a price to be right.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ store: string; sku: string }>;
}

export default async function StorefrontProductPage({ params }: Props) {
  const { store: slug, sku } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sku)) notFound();

  const store = await getStorefront(slug);
  if (!store) notFound();

  const product = await storefrontProduct(store.companyId, sku);
  if (!product) notFound();

  // The same offers the order path will charge from. A listing that reads a
  // different source is a listing that can advertise a price the checkout
  // refuses.
  const offers = await db.offer.findMany({
    where: { companyId: store.companyId, productId: product.id, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { quantity: 'asc' }],
    select: {
      id: true, name: true, quantity: true, freeQuantity: true,
      sellingPrice: true, compareAtPrice: true, isDefault: true,
    },
  });

  const offerViews = offers.map((o) => ({
    id: o.id,
    name: o.name,
    quantity: o.quantity,
    freeQuantity: o.freeQuantity,
    price: o.sellingPrice,
    compareAtPrice:
      o.compareAtPrice !== null && o.compareAtPrice > o.sellingPrice ? o.compareAtPrice : null,
    isDefault: o.isDefault,
  }));

  const regions = (
    await db.region.findMany({
      where: { countryId: store.countryId, isActive: true },
      select: { name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  ).map((r) => r.name);

  // A single-product shop's product page IS its home page, so there is
  // nowhere to go back to.
  const back = store.type === 'SINGLE_PRODUCT' ? undefined : { href: `/s/${store.slug}`, label: 'كل المنتجات' };

  return (
    <StorefrontShell store={store} back={back}>
      <article className="sf-product">
        <div className="sf-product-top">
          <div className="sf-gallery">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt={product.name} className="sf-gallery-main" />
            ) : (
              <span className="sf-card-none" aria-hidden />
            )}
            {product.gallery.length > 1 && (
              <div className="sf-gallery-strip">
                {product.gallery.slice(1, 5).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" loading="lazy" />
                ))}
              </div>
            )}
          </div>

          <div>
            <h1>{product.name}</h1>
            {product.description && <p className="sf-product-desc">{product.description}</p>}

            {offerViews.length > 0 && (
              <>
                <h2 className="lp-h2" style={{ textAlign: 'start', marginBottom: 12 }}>
                  اختر العرض المناسب
                </h2>
                <OfferCards offers={offerViews} currency={store.currencyCode} />
              </>
            )}
          </div>
        </div>

        <section className="lp-section lp-form-section">
          <h2 className="lp-h2">أكمل الطلب</h2>
          <p className="lp-sub">ادفع عند الاستلام — لا حاجة لبطاقة</p>

          <LandingFormBridge
            offers={offerViews.map((o) => ({ id: o.id, price: o.price }))}
            currency={store.currencyCode}
            product={{ id: product.id, name: product.name }}
          >
            <OrderForm
              slug={`${store.slug}/${product.sku}`}
              productName={product.name}
              basePrice={product.basePrice}
              currency={store.currencyCode}
              offers={offerViews.map((o) => ({ ...o, isDefault: o.isDefault }))}
              recommendations={[]}
              regions={regions}
              phonePlaceholder={ruleFor(store.countryCode)?.example}
              // The page's own offer cards are the picker; the form states
              // which one is chosen rather than listing them a second time.
              showOfferPicker={offerViews.length === 0}
              endpoint={`/api/public/stores/${store.slug}/products/${product.sku}/orders`}
            />
          </LandingFormBridge>
        </section>
      </article>
    </StorefrontShell>
  );
}
