import Link from 'next/link';
import { SIZES_CARD, srcSetFor } from '@/lib/responsive-image';
import { moneyText } from '@/lib/money';
import type { CardVariant } from '@/lib/store-theme';

/**
 * ONE PRODUCT, ON A CARD — AND THERE IS ONLY ONE OF THESE.
 *
 * The same markup was hand-written in four places: the shop's front page,
 * the shelf, «يُشترى معه عادةً» and «شوهد مؤخراً». Four copies is four
 * chances to forget the empty state, or the «من», or the null-name guard
 * — and three of them HAD. This is the front page's version, which was
 * the best of the four, with the other three moved onto it rather than
 * the newest one winning because it was written last.
 *
 * THREE THINGS EVERY VARIANT KEEPS, whatever the template chose:
 *
 * A FIXED IMAGE RATIO. Cards of different heights make a grid that saws
 * up and down, and on a phone that is most of what a shopper sees.
 *
 * A DESIGNED EMPTY STATE. «بطاقات المنتجات بلا صور وبلا حالة بديلة
 * مصممة» is on the brief's list of this storefront's mistakes. The
 * product's initial in a wash of the shop's own colour says «the picture
 * goes here»; a broken-image icon says «something is broken».
 *
 * AND THE PRICE, ALWAYS VISIBLE. It is in the locked core: a card that
 * makes somebody tap to find out what a thing costs has spent a page
 * load on a question the card could have answered.
 */
export function ProductCard({
  slug,
  product,
  currency,
  minorUnit,
  variant,
}: {
  slug: string;
  product: {
    id: string;
    /** The address a link should use — see `StorefrontProduct.handle`. */
    handle: string;
    sku: string;
    name: string;
    image: string | null;
    fromPrice: number;
    /** When it is higher than `fromPrice`, the card says «من». */
    basePrice?: number;
  };
  currency: string | null;
  minorUnit: number;
  variant: CardVariant;
}) {
  /**
   * A name is not guaranteed. One row with a null name took the whole
   * shop page down with «Cannot read properties of undefined» — a missing
   * letter is a dash; a missing shop is an outage.
   */
  const letter = (product.name ?? '').trim().charAt(0) || '—';

  return (
    <Link href={`/s/${slug}/p/${encodeURIComponent(product.handle)}`} className="sf-card" data-card={variant}>
      {product.image ? (
        // The seller's own upload. next/image would need every host
        // allow-listed, and a missing picture is worse than an
        // unoptimised one — so the sizes come from our own media route
        // instead. `srcSetFor` returns null for anything that is not ours,
        // and then this is the plain `src` it always was.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image}
          srcSet={srcSetFor(product.image) ?? undefined}
          sizes={srcSetFor(product.image) ? SIZES_CARD : undefined}
          alt={product.name ?? ''}
          className="sf-card-img"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="sf-card-none" data-letter={letter} aria-hidden />
      )}
      <span className="sf-card-body">
        <span className="sf-card-name">{product.name}</span>
        <span className="sf-card-price" dir="ltr">
          {/* The cheapest per unit across its bundles — the number a
              shopper compares, computed from the offers the order path
              charges from. */}
          {product.basePrice !== undefined && product.fromPrice < product.basePrice && <small>من </small>}
          {moneyText(product.fromPrice, currency, minorUnit)}
        </span>
      </span>
    </Link>
  );
}
