'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, MessageSquare, Phone } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { fillTemplate, waNumber, type FillContext, type MessageTemplate } from '@/lib/message-templates';

/**
 * CALL, SMS, WHATSAPP — from the row the parcel is on.
 *
 * Nothing goes through a gateway. The buttons open the phone's own apps
 * with the text already written, so the message leaves from the company's
 * number — the one the customer recognises and can reply to — and there is
 * no account, no key, no per-message cost and no delivery report nobody
 * reads.
 *
 * The templates are the company's own, edited in settings. Picking one is
 * two clicks because the alternative is typing the same sentence forty
 * times a day, which is where the wrong order number comes from.
 */

export function ContactButtons({
  phone,
  context,
  countryCode,
  compact,
  plain,
}: {
  phone: string | null | undefined;
  context: FillContext;
  /** Digits, e.g. "963" — wa.me needs the number in full international form. */
  countryCode?: string | null;
  compact?: boolean;
  /**
   * A number that is not a customer's — a courier's office, a rep.
   *
   * The ready-made messages are written about an order ("طلبك {رقم_الطلب}
   * خرج للتوصيل"), so offering them here would be offering nonsense. Call
   * and WhatsApp open empty, and SMS is dropped: there is nothing to pick.
   */
  plain?: boolean;
}) {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [open, setOpen] = useState<'SMS' | 'WHATSAPP' | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || templates) return;
    apiJson<{ templates: MessageTemplate[] }>('/api/settings/messages')
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
  }, [open, templates]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!phone) return null;

  /**
   * Can this machine actually send an SMS?
   *
   * `sms:` is a phone thing. On a desktop browser the link resolves to
   * nothing at all: the button is pressed, the page does not move, and
   * there is no error — which reads as a broken screen rather than as "use
   * your phone for this". WhatsApp is different, because wa.me opens
   * WhatsApp Web perfectly well from a desk.
   */
  const onPhone =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 1 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  /** WhatsApp with no message behind it — for a number that has no order. */
  const openPlainWhatsapp = () => {
    window.open(`https://wa.me/${waNumber(phone!, countryCode)}`, '_blank', 'noopener');
  };

  const send = (t: MessageTemplate) => {
    const text = fillTemplate(t.body, context);
    if (open === 'WHATSAPP') {
      const to = waNumber(phone, countryCode);
      window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } else {
      // `?body=` is what both iOS and Android accept today; older Nokia-era
      // handsets wanted `?` vs `&` differently and are not a concern here.
      window.location.href = `sms:${phone}?body=${encodeURIComponent(text)}`;
    }
    setOpen(null);
  };

  const btn = `inline-flex items-center justify-center rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] hover:border-[var(--sys-primary)]/50 transition-colors ${
    compact ? 'h-7 w-7' : 'h-8 px-2 gap-1 text-[11px]'
  }`;

  // Turned off means written but not offered — a template kept for next
  // season must not appear in the picker during this one.
  const shown = (templates ?? []).filter(
    (t) => t.active !== false && (t.channel === 'BOTH' || t.channel === open)
  );

  return (
    <div className="relative inline-flex items-center gap-1" ref={box}>
      {/* A dialler is handed digits, not a formatted number: "+962 6 000
          0000" is how a person reads it, and some phones refuse it as a
          tel: target. The leading + is kept; everything decorative goes. */}
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} title="اتصال" className={btn}>
        <Phone className="w-3.5 h-3.5" />
        {!compact && 'اتصال'}
      </a>
      {!plain && (
        <button
          type="button"
          disabled={!onPhone}
          title={
            onPhone
              ? 'رسالة نصية'
              : 'الرسائل النصية تُرسَل من الهاتف — افتح النظام على موبايلك لاستعمالها'
          }
          onClick={() => setOpen(open === 'SMS' ? null : 'SMS')}
          className={`${btn} ${onPhone ? '' : 'opacity-40 cursor-not-allowed'}`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {!compact && 'SMS'}
        </button>
      )}
      <button
        type="button"
        title="واتساب"
        onClick={plain ? openPlainWhatsapp : () => setOpen(open === 'WHATSAPP' ? null : 'WHATSAPP')}
        className={btn}
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {!compact && 'واتساب'}
      </button>

      {open && (
        <>
          {/* On a phone the list is a sheet, so it needs something to sit on
              — and a tap anywhere outside it has to close it, the same as
              the click-away does on a desk. */}
          <div className="fixed inset-0 z-30 bg-[var(--sys-sidebar)]/20 sm:hidden" onClick={() => setOpen(null)} />
          <div
            dir="rtl"
            /**
             * Phone: a sheet pinned to the bottom of the SCREEN. The row this
             * button sits in belongs to a table that scrolls sideways, so a
             * menu anchored to the cell lands half off the display — which is
             * exactly where an agent would be reading it from.
             * Desk: the ordinary dropdown under the button.
             */
            className="fixed inset-x-2 bottom-2 z-40 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--sys-border)] bg-[var(--sys-card)] shadow-xl p-1.5 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:end-0 sm:z-30 sm:mt-1 sm:w-72 sm:max-h-none sm:shadow-lg"
          >
            {templates === null ? (
              <p className="p-2 text-[11px] text-[var(--sys-muted)]">جارٍ التحميل…</p>
            ) : shown.length === 0 ? (
              <p className="p-2 text-[11px] text-[var(--sys-muted)]">
                لا رسائل جاهزة لهذه القناة — أضِفها من إعدادات النظام.
              </p>
            ) : (
              shown.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => send(t)}
                  className="w-full text-start p-2.5 sm:p-2 rounded-lg hover:bg-[var(--sys-primary-soft)] active:bg-[var(--sys-primary-soft)] transition-colors"
                >
                  <span className="block text-[11px] font-semibold text-[var(--sys-heading)]">{t.name}</span>
                  {/* The filled text, not the template: what the customer will
                      actually read is the only useful preview. */}
                  <span className="block text-[10px] text-[var(--sys-muted-foreground)] line-clamp-2 mt-0.5">
                    {fillTemplate(t.body, context)}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
