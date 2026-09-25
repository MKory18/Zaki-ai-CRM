import React from 'react';
import Link from 'next/link';
import { Phone, ChevronLeft } from 'lucide-react';
import type { Storefront } from '@/lib/storefront';
import { storeThemeVars } from '@/lib/store-theme';
import { BLOCK_CSS, fontHref } from '@/components/landing/blocks/styles';
import { STOREFRONT_CSS } from './styles';

/**
 * The frame every storefront page sits in.
 *
 * It wears the same theme engine as a landing page: one accent colour, the
 * palette derived from it, the same stylesheet. A seller who has built a
 * landing page already knows this shop's controls, and a company selling
 * through both does not end up with two different-looking brands.
 */
export function StorefrontShell({
  store,
  children,
  back,
}: {
  store: Storefront;
  children: React.ReactNode;
  /** Shown on inner pages; the home page has nowhere to go back to. */
  back?: { href: string; label: string };
}) {
  // Every variable the shop paints itself with, in one call: the palette
  // derived from the accent, plus the eight the seller may name and the
  // header's own height and colour. No component writes a hex.
  const vars = storeThemeVars(store.theme);
  const href = fontHref(store.theme.font);
  const home = `/s/${store.slug}`;
  const header = store.theme.header;
  const footer = store.theme.footer;
  // The links are a menu now, with an order and a visibility flag; the
  // theme keeps only the copyright line. getStorefront has already dropped
  // the hidden items.
  const headerMenu = store.menus.HEADER ?? [];
  const footerMenu = store.menus.FOOTER ?? [];

  return (
    <div dir="rtl" className="lp-root sf-root" style={vars as React.CSSProperties}>
      {href && <link rel="stylesheet" href={href} />}
      <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS + STOREFRONT_CSS }} />

      <header className={header?.sticky === false ? 'sf-header' : 'sf-header sf-header-sticky'}>
        <div className="sf-header-inner">
          <Link href={home} className="sf-brand">
            {store.logo && (
              // The seller's own upload; next/image would need every host
              // allow-listed, and a missing logo is worse than an unoptimised one.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="" className="sf-logo" />
            )}
            <span>
              <strong>{store.name}</strong>
              {store.tagline && <em>{store.tagline}</em>}
            </span>
          </Link>

          {headerMenu.length > 0 && (
            <nav className="sf-header-menu">
              {headerMenu.map((link, i) => (
                <a key={i} href={link.href}>{link.label}</a>
              ))}
            </nav>
          )}

          {store.supportPhone && (
            <a className="sf-phone" href={`tel:${store.supportPhone.replace(/[^\d+]/g, '')}`} dir="ltr">
              <Phone size={15} />
              {store.supportPhone}
            </a>
          )}
        </div>
      </header>

      {back && (
        <nav className="sf-back">
          <Link href={back.href}>
            <ChevronLeft size={15} />
            {back.label}
          </Link>
        </nav>
      )}

      <main>{children}</main>

      <footer className="lp-footer">
        {store.about && <p className="sf-about">{store.about}</p>}
        {footerMenu.length > 0 && (
          <nav className="sf-footer-links">
            {footerMenu.map((link, i) => (
              // Plain anchors: a menu link may point outside the shop, and
              // the schema has already refused anything that is not an
              // internal path or an http(s) address.
              <a key={i} href={link.href}>{link.label}</a>
            ))}
          </nav>
        )}
        {store.supportPhone && (
          <a className="lp-footer-phone" href={`tel:${store.supportPhone.replace(/[^\d+]/g, '')}`} dir="ltr">
            <Phone size={14} />
            {store.supportPhone}
          </a>
        )}
        <p>{footer?.copyright?.trim() || `${store.name} — جميع الحقوق محفوظة`}</p>
      </footer>
    </div>
  );
}
