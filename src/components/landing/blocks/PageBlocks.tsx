import React from 'react';
import { Check, Star, ShieldCheck, Truck, Wallet, Phone } from 'lucide-react';
import type { LandingSection } from '@/lib/landing-sections';
import type { Palette } from '@/lib/landing-theme';
import { OfferCards } from './OfferCards';
import { Countdown } from './Countdown';
import { FaqList } from './FaqList';
import { OrderCta } from './OrderCta';
import { StickyCta } from './StickyCta';

/**
 * The public renderer for a block-built page.
 *
 * Every block here is already designed: the seller chooses what appears and
 * what it says, never how far apart two things sit or what colour a button
 * is. That is the whole reason this exists — a page assembled from designed
 * parts is coherent by construction, while a page assembled from a CSS box
 * is coherent only on the days its author had taste and time.
 *
 * All colour comes from the CSS variables the theme derived. Nothing here
 * names a colour, so changing the accent restyles the entire page.
 */

export interface BlockContext {
  palette: Palette;
  productName: string;
  price: number;
  currency: string;
  /** Real remaining stock, or null when we do not know it. */
  stock: number | null;
  offers: { id: string; name: string; quantity: number; freeQuantity: number; price: number; compareAtPrice?: number | null; isDefault?: boolean }[];
  /** Rendered in place of the `form` block. */
  form: React.ReactNode;
}

export function PageBlocks({ sections, ctx }: { sections: LandingSection[]; ctx: BlockContext }) {
  return (
    <>
      {sections
        .filter((s) => s.enabled)
        .map((s) => (
          <Block key={s.id} section={s} ctx={ctx} />
        ))}
    </>
  );
}

function Block({ section: s, ctx }: { section: LandingSection; ctx: BlockContext }) {
  switch (s.type) {
    case 'announcement':
      return s.text ? <div className="lp-announce">{s.text}</div> : null;

    case 'hero':
      return <Hero section={s} ctx={ctx} />;

    case 'benefits': {
      const items = s.items.filter((i) => i.title || i.text);
      if (!items.length) return null;
      return (
        <Section title={s.title}>
          <ul className="lp-benefits">
            {items.map((item, i) => (
              <li key={i}>
                <span className="lp-benefit-mark" aria-hidden>
                  <Check size={15} strokeWidth={3} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  {item.text && <p>{item.text}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      );
    }

    case 'gallery': {
      const images = s.images.filter(Boolean);
      if (!images.length) return null;
      return (
        <Section title={s.title}>
          <div className="lp-gallery">
            {images.map((src, i) => (
              // The seller's own uploads; next/image would need every host
              // allow-listed, and a blocked hero is worse than an unoptimised one.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" loading="lazy" />
            ))}
          </div>
        </Section>
      );
    }

    case 'text':
      if (!s.body.trim()) return null;
      return (
        <Section title={s.title}>
          <div className="lp-prose">
            {s.body.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </Section>
      );

    case 'offers':
      if (!ctx.offers.length) return null;
      return (
        <Section title={s.title}>
          <OfferCards offers={ctx.offers} currency={ctx.currency} />
        </Section>
      );

    case 'reviews': {
      const items = s.items.filter((r) => r.text.trim());
      if (!items.length) return null;
      return (
        <Section title={s.title}>
          <div className="lp-reviews">
            {items.map((r, i) => (
              <figure key={i}>
                <div className="lp-stars" aria-label={`${r.stars} من 5`}>
                  {Array.from({ length: 5 }, (_, n) => (
                    <Star key={n} size={13} fill={n < r.stars ? 'currentColor' : 'none'} strokeWidth={1.5} />
                  ))}
                </div>
                <blockquote>{r.text}</blockquote>
                {r.name && <figcaption>{r.name}</figcaption>}
              </figure>
            ))}
          </div>
        </Section>
      );
    }

    case 'faq': {
      const items = s.items.filter((i) => i.q.trim());
      if (!items.length) return null;
      return (
        <Section title={s.title}>
          <FaqList items={items} />
        </Section>
      );
    }

    case 'urgency':
      return <Urgency section={s} ctx={ctx} />;

    case 'form':
      return (
        <section className="lp-section lp-form-section">
          {s.title && <h2 className="lp-h2">{s.title}</h2>}
          {s.subtitle && <p className="lp-sub">{s.subtitle}</p>}
          {ctx.form}
        </section>
      );

    case 'trust': {
      const items = s.items.filter((i) => i.title);
      if (!items.length) return null;
      const icons = [ShieldCheck, Truck, Wallet];
      return (
        <div className="lp-trust">
          {items.map((item, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div key={i}>
                <Icon size={18} />
                <strong>{item.title}</strong>
                {item.text && <span>{item.text}</span>}
              </div>
            );
          })}
        </div>
      );
    }

    case 'footer': {
      const columns = s.columns
        .map((c) => ({ ...c, links: c.links.filter((l) => l.label && l.url) }))
        .filter((c) => c.title || c.links.length);
      return (
        <footer className="lp-footer">
          {s.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo} alt="" className="lp-footer-logo" />
          )}

          {columns.length > 0 && (
            <nav className="lp-footer-cols">
              {columns.map((c, i) => (
                <div key={i}>
                  {c.title && <h3>{c.title}</h3>}
                  <ul>
                    {c.links.map((l, n) => (
                      <li key={n}>
                        {/* The seller's own links, but the page is public:
                            an external target never gets to reach back
                            through window.opener. */}
                        <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}

          {s.phone && (
            <a className="lp-footer-phone" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
              <Phone size={14} />
              {s.phone}
            </a>
          )}
          <p>{s.text || 'جميع الحقوق محفوظة'}</p>
        </footer>
      );
    }

    case 'sticky':
      // Fixed to the bottom of the screen, wherever it sits in the order.
      return (
        <StickyCta
          text={s.text}
          showPrice={s.showPrice}
          offers={ctx.offers}
          basePrice={ctx.price}
          currency={ctx.currency}
        />
      );
  }
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="lp-section">
      {title && <h2 className="lp-h2">{title}</h2>}
      {children}
    </section>
  );
}

function Hero({ section: s, ctx }: { section: Extract<LandingSection, { type: 'hero' }>; ctx: BlockContext }) {
  const headline = s.headline || ctx.productName;
  return (
    <header className="lp-hero">
      {s.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} alt={headline} className="lp-hero-img" />
      )}
      <h1 className="lp-h1">{headline}</h1>
      {s.subheadline && <p className="lp-hero-sub">{s.subheadline}</p>}
      {s.showPrice && ctx.price > 0 && (
        <p className="lp-price" dir="ltr">
          {ctx.price.toLocaleString('en-US')} <span>{ctx.currency}</span>
        </p>
      )}
      <OrderCta className="lp-cta">{s.ctaText || 'اطلب الآن'}</OrderCta>
    </header>
  );
}

function Urgency({ section: s, ctx }: { section: Extract<LandingSection, { type: 'urgency' }>; ctx: BlockContext }) {
  // Only a genuinely low count is worth showing. Inventing scarcity is the
  // one thing this block deliberately cannot do.
  const lowStock = s.showRealStock && ctx.stock !== null && ctx.stock > 0 && ctx.stock <= 20 ? ctx.stock : null;
  if (!s.text && !s.minutes && lowStock === null) return null;

  return (
    <div className="lp-urgency">
      {s.text && <p>{s.text}</p>}
      {s.minutes > 0 && <Countdown minutes={s.minutes} />}
      {lowStock !== null && (
        <p className="lp-stock">
          بقي <strong>{lowStock}</strong> فقط في المخزون
        </p>
      )}
    </div>
  );
}
