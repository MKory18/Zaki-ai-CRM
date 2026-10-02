import React from 'react';
import Link from 'next/link';
import type { Storefront } from '@/lib/storefront';
import { cartBarApplies, layoutOf, storeThemeVars } from '@/lib/store-theme';
import { telHref, whatsappHref } from '@/lib/store-contact';
import { fontHref } from '@/components/landing/blocks/styles';
import { SHOP_SHEET } from './styles';
// Six drawings from this shop's own file, not the package they came
// from: a named import there still shipped 245 icons to a shopper.
// See the note at the top of ./icons.
import { RiArrowLeftSLine, RiPhoneLine, RiSearchLine, RiWhatsappLine } from './icons';
import { CartLink } from './CartLink';

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
  footer: showFooter = true,
}: {
  store: Storefront;
  children: React.ReactNode;
  /** Shown on inner pages; the home page has nowhere to go back to. */
  back?: { href: string; label: string };
  /**
   * False when the page inside already ends with a footer of its own — a
   * landing page fronting a store carries one as a block. Two footers is
   * the duplication the store section exists to avoid.
   */
  footer?: boolean;
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
  // One owner for the shop's own contact links — see store-contact.ts on
  // why this is not `ContactButtons`.
  const contact = { whatsapp: whatsappHref(store.supportPhone), tel: telHref(store.supportPhone) };
  const footerMenu = store.menus.FOOTER ?? [];

  return (
    // The shop's own language and direction. This was written as rtl, so a
    // shop selling in English had its heading, price and arrows mirrored.
    <div dir={store.dir} lang={store.language} className="lp-root sf-root" style={vars as React.CSSProperties}>
      {/*
        THE HANDSHAKE, BEFORE THE FONT IS ASKED FOR.

        The face is served from a second origin, so on a slow connection
        the browser pays DNS, TCP and TLS to fonts.gstatic.com before the
        first byte of the font is requested — and it does not learn that
        the origin exists until it has parsed the stylesheet below, which
        came from a THIRD origin it also had to reach first. That is two
        round trips in front of the text, on the connection where a round
        trip costs the most.

        `crossOrigin` is required on the gstatic one: fonts are fetched in
        CORS mode, and a preconnect without it opens a connection the font
        request cannot reuse — the cost paid and nothing bought.
      */}
      {href && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={href} />
        </>
      )}
      <style dangerouslySetInnerHTML={{ __html: SHOP_SHEET }} />

      {/*
        THE VARIANT IS AN ARRANGEMENT, NEVER A SUBTRACTION.
        `data-header` moves these things around in CSS; it cannot remove
        one. The search, the basket and the WhatsApp button are the locked
        core — «أي تخصيص بيخرب عنصر منهم بينرفض مع السبب» — so they are
        rendered unconditionally and the stylesheet only decides where.
      */}
      <header
        data-header={layoutOf(store.theme, 'header')}
        className={header?.sticky === false ? 'sf-header' : 'sf-header sf-header-sticky'}
      >
        <div className="sf-header-inner">
          <Link href={home} className="sf-brand">
            {store.logo ? (
              // The seller's own upload; next/image would need every host
              // allow-listed, and a missing logo is worse than an unoptimised one.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="" className="sf-logo" />
            ) : (
              // A SHOP WITH NO LOGO STILL HAS A MARK. Most shops have not
              // uploaded one — measured: none of the three here had — and a
              // bare line of text is not a brand. This disappears the moment
              // a real logo arrives.
              <span className="sf-mark" aria-hidden>{store.name.trim().charAt(0)}</span>
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

          {/*
            THE SEARCH. A plain GET form to the shelf: it works before any
            script runs, which on a mid-range Android is the difference
            between a search box and a dead field.
          */}
          <form className="sf-search" action={`/s/${store.slug}/shop`} method="get" role="search">
            <label className="sr-only" htmlFor="sf-q">
              ابحث في المتجر
            </label>
            <input id="sf-q" type="search" name="q" placeholder="ابحث في المتجر" maxLength={60} />
            <button type="submit" aria-label="ابحث">
              <RiSearchLine size={18} aria-hidden />
            </button>
          </form>

          {/* A shop with one product has no basket — `cartBarApplies` is
              the one place that is decided. */}
          {cartBarApplies(store.type) && <CartLink slug={store.slug} />}

          {contact.whatsapp && (
            <>
              {/*
                A BUTTON, NOT A LINE OF TEXT. «رقم الهاتف نص، مش زر تواصل»
                is on the brief's list of mistakes this engine does not
                repeat: a customer deciding whether to trust a shop wants
                to reach a person, and a number they have to copy is a
                number they do not call.
              */}
              <a
                className="sf-whatsapp"
                href={contact.whatsapp}
                rel="noopener noreferrer"
                target="_blank"
              >
                <RiWhatsappLine size={18} aria-hidden />
                <span>واتساب</span>
              </a>
              {contact.tel && (
                <a className="sf-phone" href={contact.tel} dir="ltr">
                  <RiPhoneLine size={15} />
                  {store.supportPhone}
                </a>
              )}
            </>
          )}
        </div>

        {/*
          THE REASSURANCE LINE, VISIBLE. The customer is deciding in
          seconds whether to trust a shop they have never heard of, and
          these are the two facts that answer that — so they are in the
          header rather than somewhere they have to scroll to.
        */}
        <p className="sf-assure">الدفع عند الاستلام · توصيل لكل المحافظات</p>
      </header>

      {/*
        THE FLOATING WHATSAPP, AT A FIXED CORNER.
        «زر واتساب عائم بزاوية ثابتة، ما بيغطي الشريط السفلي» — so it is
        offset above the bottom bar's own height rather than pinned to
        the bottom, and the offset is one variable both of them read. A
        button that covers «إتمام الطلب» is a button that costs a sale
        to save a tap.
      */}
      {contact.whatsapp && (
        <a
          className="sf-float-wa"
          href={contact.whatsapp}
          rel="noopener noreferrer"
          target="_blank"
          aria-label="تواصل عبر واتساب"
        >
          <RiWhatsappLine size={24} aria-hidden />
        </a>
      )}

      {back && (
        <nav className="sf-back">
          <Link href={back.href}>
            <RiArrowLeftSLine className="icon-mirror" size={15} />
            {back.label}
          </Link>
        </nav>
      )}

      <main>{children}</main>

      {showFooter && (
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
            <RiPhoneLine size={14} />
            {store.supportPhone}
          </a>
        )}
        <p>{footer?.copyright?.trim() || `${store.name} — جميع الحقوق محفوظة`}</p>
      </footer>
      )}
    </div>
  );
}
