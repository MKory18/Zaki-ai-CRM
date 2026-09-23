import React from 'react';
import { Check, Star, ShieldCheck, Truck, Wallet, Phone, ChevronUp, ChevronDown, Eye, EyeOff, Trash2 } from 'lucide-react';
import type { LandingSection } from '@/lib/landing-sections';
import { lookStyles } from '@/lib/block-look';
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

/**
 * Picking a block by touching it, rather than hunting for its row.
 *
 * Passed ONLY by the builder. The published page never receives it, so the
 * customer's page carries no outlines, no listeners and no chrome — the
 * same renderer draws both, which is the whole reason the preview can be
 * trusted.
 */
export interface BlockSelection {
  activeId: string | null;
  onSelect: (id: string) => void;
  /** The block's Arabic name, for the badge on hover. */
  label: (s: LandingSection) => string;
  onMove?: (id: string, by: -1 | 1) => void;
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
}

export function PageBlocks({
  sections,
  ctx,
  selection,
}: {
  sections: LandingSection[];
  ctx: BlockContext;
  selection?: BlockSelection;
}) {
  const shown = selection ? sections : sections.filter((s) => s.enabled);

  return (
    <>
      {shown.map((s, i) => {
        const block = (
          <Dressed section={s}>
            <Block section={s} ctx={ctx} />
          </Dressed>
        );
        if (!selection) return <React.Fragment key={s.id}>{block}</React.Fragment>;
        return (
          <Selectable
            key={s.id}
            section={s}
            selection={selection}
            first={i === 0}
            last={i === shown.length - 1}
          >
            {block}
          </Selectable>
        );
      })}
    </>
  );
}

/**
 * The block's own width, spacing, background and type.
 *
 * Wrapping rather than threading the look through thirteen components: a
 * block should keep saying what it says, and this decides how it sits. The
 * outer layer is full-bleed so a background can reach the screen edges; the
 * inner one holds the width and the gutter, so the text never does.
 */
function Dressed({ section, children }: { section: LandingSection; children: React.ReactNode }) {
  const { outer, inner, overlay } = lookStyles(section.look);
  const plain =
    !section.look ||
    (Object.keys(outer).length === 2 && !outer.background && !outer.backgroundImage);

  // A block nobody has styled renders exactly as it did before any of this
  // existed — no extra wrapper, no changed spacing, nothing to regress.
  if (plain && !section.look) return <>{children}</>;

  return (
    <div style={outer}>
      {overlay > 0 && (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${overlay})` }}
        />
      )}
      <div style={inner}>{children}</div>
    </div>
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

/**
 * The outline, the name and the handles that appear around a block in the
 * builder — and only there.
 *
 * Hover shows what this is; clicking makes it the one being edited. The
 * handles are the three things wanted at the moment of pointing at
 * something: move it, hide it, remove it. Everything else stays in the
 * panel, because a toolbar with nine buttons on it is a toolbar nobody
 * reads.
 *
 * A hidden block still draws here, dimmed — it has to, or "show it again"
 * means finding a row for something invisible.
 */
function Selectable({
  section: s,
  selection,
  first,
  last,
  children,
}: {
  section: LandingSection;
  selection: BlockSelection;
  first: boolean;
  last: boolean;
  children: React.ReactNode;
}) {
  const active = selection.activeId === s.id;
  const off = !s.enabled;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        selection.onSelect(s.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selection.onSelect(s.id);
        }
      }}
      className={`group relative cursor-pointer outline-none transition-[box-shadow] ${
        active ? 'z-10 shadow-[inset_0_0_0_2px_#b8256e]' : 'hover:shadow-[inset_0_0_0_2px_#f2c9dd]'
      }`}
      style={off ? { opacity: 0.45 } : undefined}
    >
      {/* The name, on hover or while selected — placed inside the block so a
          tall one is still labelled where the cursor is. */}
      <span
        className={`pointer-events-none absolute start-2 top-2 z-20 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity ${
          active ? 'bg-[#b8256e] opacity-100' : 'bg-[#121926]/70 opacity-0 group-hover:opacity-100'
        }`}
      >
        {selection.label(s)}
        {off && ' — مخفي'}
      </span>

      {active && (
        <span
          className="absolute end-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-white/95 p-1 shadow-md ring-1 ring-[#e3e8ef]"
          onClick={(e) => e.stopPropagation()}
        >
          <Handle
            title="لأعلى"
            disabled={first}
            onClick={() => selection.onMove?.(s.id, -1)}
            icon={<ChevronUp className="h-3.5 w-3.5" />}
          />
          <Handle
            title="لأسفل"
            disabled={last}
            onClick={() => selection.onMove?.(s.id, 1)}
            icon={<ChevronDown className="h-3.5 w-3.5" />}
          />
          <Handle
            title={s.enabled ? 'إخفاء' : 'إظهار'}
            onClick={() => selection.onToggle?.(s.id)}
            icon={s.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          />
          <Handle
            title="حذف"
            danger
            onClick={() => selection.onRemove?.(s.id)}
            icon={<Trash2 className="h-3.5 w-3.5" />}
          />
        </span>
      )}

      {children}
    </div>
  );
}

function Handle({
  title,
  icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`cursor-pointer rounded p-1 disabled:cursor-default disabled:opacity-30 ${
        danger ? 'text-[#fb323f] hover:bg-[#feecee]' : 'text-[#364152] hover:bg-[#eef2f6]'
      }`}
    >
      {icon}
    </button>
  );
}
