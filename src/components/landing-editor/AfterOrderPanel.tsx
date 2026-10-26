'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';

/**
 * «بعد الطلب» — everything that happens once the order is in, in one place on the form block.
 *
 * «الابسيل والكروس سيل حاسهم مخفيين… مش اتفقنا قبل كل اشي بيدل ع بعضو؟». The «زيد علبة» offer is set on the
 * product's offers, its window in the system settings, the suggested products on the page's details screen — three
 * places, and nothing in the page editor pointed at any of them. This panel says whether each is on, and links to
 * where it is set. And the WhatsApp button after the order is set right here: on/off, its words, the message, the
 * number, and whether WhatsApp opens by itself.
 */

export interface AfterOrderSection {
  whatsappAfter: boolean;
  whatsappLabel: string;
  whatsappMessage: string;
  whatsappNumber: string;
  whatsappAutoOpen: boolean;
  afterOrderFlow: 'together' | 'sequence';
  afterOrderBanner: 'none' | 'congrats' | 'countdown';
  afterOrderBannerText: string;
  upsellLook: 'card' | 'banner' | 'compact';
  crossSellLook: 'list' | 'cards';
}

/** One row of mutually exclusive choices — the editor's segmented control. */
function Choices<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-semibold text-[var(--sys-heading)]">{label}</span>
      <div className="flex gap-1 rounded-md bg-[var(--sys-surface-strong)] p-0.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`flex-1 rounded-sm px-2 py-1.5 text-xs font-bold transition ${
              value === v ? 'bg-[var(--sys-card)] text-[#0f172a] shadow-raised' : 'text-[var(--sys-muted-foreground)] hover:text-[#0f172a]'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface AfterOrderContext {
  productId?: string | null;
  pageId?: string | null;
  storePhone?: string | null;
}

const ROW = 'flex items-start justify-between gap-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-2.5';
const LINK = 'shrink-0 rounded-md border border-[var(--sys-border)] px-2 py-1 text-xs font-semibold text-[var(--sys-primary)] hover:bg-[var(--sys-surface)]';
const FIELD = 'w-full rounded-md border border-[var(--sys-border-input)] bg-[var(--sys-card)] px-2 py-1.5 text-xs text-[var(--sys-foreground)]';

export function AfterOrderPanel({
  section: s,
  patch,
  ctx,
}: {
  section: AfterOrderSection;
  patch: (fields: Record<string, unknown>) => void;
  ctx: AfterOrderContext;
}) {
  const [upsell, setUpsell] = useState<number | null>(null);
  const [crossSell, setCrossSell] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    if (ctx.productId) {
      apiJson<{ offers?: { postOrderOffer?: boolean; isActive?: boolean }[] }>(`/api/offers?productId=${encodeURIComponent(ctx.productId)}`)
        .then((d) => live && setUpsell((d.offers ?? []).filter((o) => o.postOrderOffer && o.isActive !== false).length))
        .catch(() => live && setUpsell(null));
    }
    if (ctx.pageId) {
      apiJson<{ recommendations?: unknown[] }>(`/api/landing-pages/${ctx.pageId}/recommendations`)
        .then((d) => live && setCrossSell((d.recommendations ?? []).length))
        .catch(() => live && setCrossSell(null));
    }
    return () => {
      live = false;
    };
  }, [ctx.productId, ctx.pageId]);

  const number = s.whatsappNumber.trim() || ctx.storePhone || '';

  return (
    <section aria-label="بعد الطلب" className="space-y-2 rounded-lg bg-[var(--sys-surface)] p-2.5">
      <p className="text-xs font-bold text-[var(--sys-heading)]">بعد الطلب</p>

      {/* The offer and the suggestions — whether they are on, and where to set them. */}
      <div className={ROW}>
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-[var(--sys-heading)]">عرض «زيد علبة» (أب سيل)</p>
          <p className="text-[var(--sys-muted-foreground)]">
            {upsell === null ? 'من عروض المنتج' : upsell > 0 ? `شغّال — ${upsell} عرض` : 'مطفي — ما في عرض بعد الطلب'}
          </p>
        </div>
        {ctx.productId && (
          <a href={`/products/${ctx.productId}#offers`} target="_blank" rel="noopener noreferrer" className={LINK}>
            عروض المنتج
          </a>
        )}
      </div>
      <div className={ROW}>
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-[var(--sys-heading)]">منتجات مقترحة (كروس سيل)</p>
          <p className="text-[var(--sys-muted-foreground)]">
            {crossSell === null ? 'من تفاصيل الصفحة' : crossSell > 0 ? `${crossSell} منتج` : 'ما في منتجات مقترحة'}
          </p>
        </div>
        {ctx.pageId && (
          <a href={`/store/landing-pages/${ctx.pageId}#recommendations`} target="_blank" rel="noopener noreferrer" className={LINK}>
            المنتجات المقترحة
          </a>
        )}
      </div>
      <div className={ROW}>
        <p className="min-w-0 text-xs text-[var(--sys-muted-foreground)]">كم دقيقة بيضل الزبون يقدر يزيد على طلبه</p>
        <a href="/settings/system" target="_blank" rel="noopener noreferrer" className={LINK}>
          مدّة العرض
        </a>
      </div>

      {/*
        HOW THE TWO ARE SHOWN — «يكونو يا مع بعض يا ورا بعض» · «شريط مبروك أو عدّاد» · «اشكال الأب سيل والكروس سيل».
        The countdown is the real window above, never an invented deadline.
      */}
      <Choices
        label="ترتيب العرضين"
        value={s.afterOrderFlow}
        options={[['together', 'مع بعض'], ['sequence', 'ورا بعض']] as const}
        onPick={(v) => patch({ afterOrderFlow: v })}
      />
      <Choices
        label="شريط فوق العروض"
        value={s.afterOrderBanner}
        options={[['none', 'بلا'], ['congrats', 'مبروك'], ['countdown', 'عدّاد']] as const}
        onPick={(v) => patch({ afterOrderBanner: v })}
      />
      {s.afterOrderBanner === 'congrats' && (
        <input aria-label="نص شريط مبروك" className={FIELD} maxLength={80} value={s.afterOrderBannerText} onChange={(e) => patch({ afterOrderBannerText: e.target.value })} />
      )}
      {s.afterOrderBanner === 'countdown' && (
        <p className="text-xs text-[var(--sys-muted-foreground)]">بيعدّ مدّة العرض الحقيقية من إعدادات النظام، ولما تخلص العروض بتختفي.</p>
      )}
      <Choices
        label="شكل الأب سيل"
        value={s.upsellLook}
        options={[['card', 'بطاقة'], ['banner', 'شريط ملوّن'], ['compact', 'سطر واحد']] as const}
        onPick={(v) => patch({ upsellLook: v })}
      />
      <Choices
        label="شكل الكروس سيل"
        value={s.crossSellLook}
        options={[['list', 'قائمة'], ['cards', 'بطاقات']] as const}
        onPick={(v) => patch({ crossSellLook: v })}
      />

      {/* The WhatsApp button after the order. */}
      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--sys-heading)]">
        <input type="checkbox" checked={s.whatsappAfter} onChange={(e) => patch({ whatsappAfter: e.target.checked })} />
        زر واتساب بعد الطلب
      </label>
      {s.whatsappAfter && (
        <div className="space-y-1.5">
          <input aria-label="نص زر واتساب" className={FIELD} maxLength={40} value={s.whatsappLabel} onChange={(e) => patch({ whatsappLabel: e.target.value })} />
          <textarea
            aria-label="رسالة واتساب"
            className={FIELD}
            rows={2}
            maxLength={300}
            value={s.whatsappMessage}
            onChange={(e) => patch({ whatsappMessage: e.target.value })}
          />
          <p className="text-xs text-[var(--sys-muted-foreground)]">اكتب {'{رقم_الطلب}'} مكان ما بدك يطلع رقم الطلب.</p>
          <input
            aria-label="رقم واتساب"
            className={FIELD}
            dir="ltr"
            inputMode="tel"
            maxLength={30}
            placeholder={ctx.storePhone ? `رقم المتجر: ${ctx.storePhone}` : '+9639XXXXXXXX'}
            value={s.whatsappNumber}
            onChange={(e) => patch({ whatsappNumber: e.target.value.replace(/[^+0-9 ()-]/g, '') })}
          />
          {!number && (
            <p className="text-xs font-semibold text-[var(--sys-warning)]">ما في رقم — الزر ما رح يطلع. اكتب رقماً هون أو من إعدادات المتجر.</p>
          )}
          <label className="flex items-center gap-2 text-xs text-[var(--sys-foreground)]">
            <input type="checkbox" checked={s.whatsappAutoOpen} onChange={(e) => patch({ whatsappAutoOpen: e.target.checked })} />
            افتح واتساب لحاله بعد 3 ثواني
          </label>
          {s.whatsappAutoOpen && (
            <p className="text-xs text-[var(--sys-warning)]">الزبون بيطلع من الصفحة — عرض «زيد علبة» والمنتجات المقترحة ما رح يشوفهم.</p>
          )}
        </div>
      )}
    </section>
  );
}
