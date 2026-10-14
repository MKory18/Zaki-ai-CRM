import Link from 'next/link';
import type { HeroVariant } from '@/lib/layout-slots';
import { moneyText } from '@/lib/money';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE SHOP'S FIRST SCREEN — THE ONE THE TEMPLATE ACTUALLY PICKED.
 *
 * `LAYOUT_SLOTS.hero` has named five of these since it was written. The
 * gallery drew all five in its miniature, so a seller opened «القوالب»,
 * saw five visibly different first screens, picked one, and saved it. The
 * shop then drew a sixth thing nobody had chosen: the tagline in a box —
 * or, when the tagline was empty, nothing at all, and the page opened on
 * a bare grid. `layoutOf(theme, 'hero')` was called nowhere in the
 * storefront. See `docs/storefront/AUDIT-2a-delta.md` §2.
 *
 * ── ONE COMPONENT, TWO SIZES ──
 *
 * The gallery's miniature used to be a second, inline-styled drawing of
 * the same five ideas, and that is why the two could disagree without
 * anybody noticing: nothing connected them except a word. Now there is
 * one component. `mini` renders the same markup and the same variant
 * branch at preview scale — no fonts, no links, placeholder content —
 * so a hero that does not exist here cannot be promised there.
 *
 * ── WHAT A HERO MAY NOT BE ──
 *
 * The rule from `layout-slots.ts` holds: there is no variant here that
 * means «the shop's name, alone». Every one of the five leads with
 * something to buy, something on offer, or a way in. A header already
 * carries the name; a first screen that repeats it sells nothing.
 *
 * ── NO MONEY IS COMPUTED HERE ──
 *
 * Prices arrive already resolved — `fromPrice` off the shelf, the same
 * number the card and the checkout use — and are only formatted, through
 * the one formatter. A hero that did its own arithmetic would be a fourth
 * place a price could be wrong.
 * ═══════════════════════════════════════════════════════════════════════
 */

export interface HeroProduct {
  id: string;
  name: string;
  handle: string;
  image: string | null;
  fromPrice: number;
}

export interface HeroCategory {
  id: string;
  name: string;
}

export interface StoreHeroProps {
  variant: HeroVariant;
  /** The shop's own words. Either may be empty — no variant depends on them. */
  tagline?: string | null;
  about?: string | null;
  slug: string;
  currency: string | null;
  minorUnit: number;
  /** Already on the shelf, already priced. Newest first, as the grid has them. */
  products: HeroProduct[];
  categories: HeroCategory[];
  /** Preview scale: same markup, no links, no fonts, placeholder-safe. */
  mini?: boolean;
}

/** A product's picture, or its initial — the shop-wide answer to «no photo yet». */
function Thumb({ product }: { product: HeroProduct }) {
  return (
    <span className="sf-hx-img" data-letter={(product.name ?? '').trim().charAt(0)}>
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image} alt="" loading="lazy" decoding="async" />
      ) : null}
    </span>
  );
}

export function StoreHero({
  variant,
  tagline,
  about,
  slug,
  currency,
  minorUnit,
  products,
  categories,
  mini = false,
}: StoreHeroProps) {
  /*
   * A LINK IN THE SHOP, A PLAIN BOX IN THE MINIATURE.
   *
   * The preview lives inside the dashboard, where a storefront link would
   * navigate the seller out of the screen they are choosing a template on.
   */
  const Wrap = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
    mini ? <span className={className}>{children}</span> : <Link href={href} className={className}>{children}</Link>;

  const price = (p: HeroProduct) => moneyText(p.fromPrice, currency, minorUnit);

  const body = (() => {
    switch (variant) {
      /*
       * THE GOODS THEMSELVES, BIG, BEFORE ANYTHING ELSE.
       * The brief's «أول شاشة ما فيها منتج ولا عرض ولا فئة» answered most
       * directly: three products, large, above the grid they repeat from.
       * It is the default because a shop that has set nothing still opens
       * on something a shopper can tap.
       */
      case 'productFirst':
        return products.slice(0, 3).map((p) => (
          <Wrap key={p.id} href={`/s/${slug}/p/${encodeURIComponent(p.handle)}`} className="sf-hx-feature">
            <Thumb product={p} />
            <span className="sf-hx-name">{p.name}</span>
            <span className="sf-hx-price">{price(p)}</span>
          </Wrap>
        ));

      /*
       * THE CHEAPEST THINGS FIRST, AS A STRIP.
       * «من» prices off the shelf, ascending — the shop leading with its
       * reason to buy today rather than with its name.
       */
      case 'offerStrip': {
        const cheap = [...products].sort((a, b) => a.fromPrice - b.fromPrice).slice(0, 4);
        return cheap.map((p) => (
          <Wrap key={p.id} href={`/s/${slug}/p/${encodeURIComponent(p.handle)}`} className="sf-hx-offer">
            <span className="sf-hx-name">{p.name}</span>
            <span className="sf-hx-price">{price(p)}</span>
          </Wrap>
        ));
      }

      /*
       * THE WAYS IN, AS TILES.
       * For a shop whose shopper arrives knowing the KIND of thing they
       * want and not the product. Falls back to products when the shop has
       * no categories — a first screen of empty tiles is the «nothing to
       * buy» failure wearing a different shape.
       */
      case 'categoryTiles': {
        if (categories.length === 0) {
          return products.slice(0, 3).map((p) => (
            <Wrap key={p.id} href={`/s/${slug}/p/${encodeURIComponent(p.handle)}`} className="sf-hx-feature">
              <Thumb product={p} />
              <span className="sf-hx-name">{p.name}</span>
            </Wrap>
          ));
        }
        return categories.slice(0, 6).map((c) => (
          <Wrap key={c.id} href={`/s/${slug}/shop?cat=${encodeURIComponent(c.id)}`} className="sf-hx-tile">
            <span className="sf-hx-name">{c.name}</span>
          </Wrap>
        ));
      }

      /*
       * THE SHOP'S OWN SENTENCE, SET LIKE A SENTENCE.
       * The only variant that leads with words — for a shop whose promise
       * is the reason to trust it («نوصّل لكل المحافظات، والدفع عند
       * الاستلام»). It still ends in a way forward, and it still shows a
       * product beside it, so it is never a page of prose.
       */
      case 'editorial':
        return (
          <>
            <span className="sf-hx-say">
              <strong>{tagline || 'كل المنتجات'}</strong>
              {about ? <em>{about}</em> : null}
              <Wrap href={`/s/${slug}/shop`} className="sf-hx-go">تسوّق الآن</Wrap>
            </span>
            {products[0] ? (
              <Wrap href={`/s/${slug}/p/${encodeURIComponent(products[0].handle)}`} className="sf-hx-feature">
                <Thumb product={products[0]} />
                <span className="sf-hx-name">{products[0].name}</span>
                <span className="sf-hx-price">{price(products[0])}</span>
              </Wrap>
            ) : null}
          </>
        );

      /*
       * THREE, SIDE BY SIDE, SCROLLED BY HAND.
       * «بثلاث شرائح كحد أقصى» and nothing that moves on its own — the
       * motion rule the contract already enforces. A CSS scroll-snap row,
       * so it costs no JavaScript and works with the keyboard.
       */
      case 'slider':
        return products.slice(0, 3).map((p) => (
          <Wrap key={p.id} href={`/s/${slug}/p/${encodeURIComponent(p.handle)}`} className="sf-hx-slide">
            <Thumb product={p} />
            <span className="sf-hx-name">{p.name}</span>
            <span className="sf-hx-price">{price(p)}</span>
          </Wrap>
        ));
    }
  })();

  /*
   * NOTHING TO SHOW IS NOTHING DRAWN.
   *
   * Four of the five are made of the shelf, and a shop with an empty
   * shelf would otherwise render an empty box above the «لا منتجات
   * معروضة» line. `editorial` always has something, because its content
   * is the shop's own words with a fallback.
   */
  if (!body || (Array.isArray(body) && body.length === 0)) return null;

  return (
    <section className="sf-hx" data-hero-slot={variant} data-mini={mini ? '1' : undefined}>
      {body}
    </section>
  );
}
