'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { screenApi as crmApi } from '@/lib/screen-api';
import { RiAddCircleLine, RiArrowDownSLine, RiArrowUpSLine, RiDeleteBinLine, RiEyeOffLine, RiLoader4Line, RiMagicLine, RiPencilLine, RiPriceTag3Line, RiStarLine } from '@remixicon/react';

/**
 * A product's offers, edited where the product is.
 *
 * They used to be managed on a separate screen and copied again onto every
 * landing page — three places to change one price, and nothing to tell you
 * when they disagreed. Here there is one list: the landing page, the quick
 * order and the order screen all read it.
 *
 * Deliberately NOT the option/value matrix a big storefront uses. For a
 * one-product cash-on-delivery store the whole catalogue of choices is
 * "how many, and for how much", and a matrix makes you build a grid to
 * express three rows.
 */

interface Offer {
  id: string;
  name: string;
  quantity: number;
  freeQuantity: number;
  sellingPrice: number;
  compareAtPrice: number | null;
  discount: number;
  deliveryIncluded: boolean;
  isDefault: boolean;
  sortOrder: number;
  status: string;
}

type Draft = Partial<Offer> & { quantity: number; sellingPrice: number };

export function ProductOffers({
  productId, basePrice, currency, canManage = true,
}: {
  productId: string;
  basePrice: number;
  currency: string;
  canManage?: boolean;
}) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await crmApi(`/api/offers?productId=${encodeURIComponent(productId)}`);
      setOffers(d.offers || []);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر تحميل العروض' });
      setOffers([]);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!draft?.name?.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const body = JSON.stringify({
        productId,
        name: draft.name,
        quantity: draft.quantity,
        freeQuantity: draft.freeQuantity ?? 0,
        sellingPrice: draft.sellingPrice,
        compareAtPrice: draft.compareAtPrice ?? null,
        discount: draft.discount ?? 0,
        deliveryIncluded: draft.deliveryIncluded ?? true,
        isDefault: draft.isDefault ?? false,
        sortOrder: draft.sortOrder ?? (offers?.length ?? 0),
        status: draft.status ?? 'ACTIVE',
      });
      if (draft.id) {
        await crmApi(`/api/offers/${draft.id}`, { method: 'PATCH', body });
      } else {
        await crmApi('/api/offers', { method: 'POST', body });
      }
      setDraft(null);
      await load();
      setMsg({ ok: true, text: 'تم الحفظ' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    setBusy(true);
    try {
      await crmApi(`/api/offers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر التعديل' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await crmApi(`/api/offers/${id}`, { method: 'DELETE' });
      await load();
      if (res?.retired) setMsg({ ok: true, text: res.message });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر الحذف' });
    } finally {
      setBusy(false);
    }
  }

  /** Three tiers from the base price, so a new product is sellable in one click. */
  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const tiers = [
        { n: 1, free: 0, mult: 1, label: 'قطعة واحدة' },
        { n: 2, free: 0, mult: 1.8, label: 'قطعتان' },
        { n: 3, free: 1, mult: 2.5, label: 'ثلاث قطع + واحدة هدية' },
      ];
      for (const [i, t] of tiers.entries()) {
        await crmApi('/api/offers', {
          method: 'POST',
          body: JSON.stringify({
            productId,
            name: t.label,
            quantity: t.n,
            freeQuantity: t.free,
            sellingPrice: Math.round(basePrice * t.mult),
            // The "was" price is what the same count costs one at a time —
            // a real comparison, not an invented one.
            compareAtPrice: t.n > 1 ? Math.round(basePrice * (t.n + t.free)) : null,
            isDefault: i === 1,
            sortOrder: i,
          }),
        });
      }
      await load();
      setMsg({ ok: true, text: 'تم توليد ثلاثة عروض — عدّلها كما تشاء' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر التوليد' });
    } finally {
      setBusy(false);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    if (!offers) return;
    const j = i + dir;
    if (j < 0 || j >= offers.length) return;
    await Promise.all([
      crmApi(`/api/offers/${offers[i].id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: j }) }),
      crmApi(`/api/offers/${offers[j].id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: i }) }),
    ]);
    await load();
  }

  const money = (n: number) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <RiPriceTag3Line className="w-4 h-4 text-[var(--sys-primary)]" />
            <span>عروض المنتج</span>
          </span>
        }
        action={
          canManage && (
            <div className="flex items-center gap-2">
              {offers?.length === 0 && basePrice > 0 && (
                <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
                  <RiMagicLine className="w-4 h-4" /> توليد سريع
                </Button>
              )}
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    name: '',
                    quantity: 1,
                    freeQuantity: 0,
                    sellingPrice: basePrice,
                    compareAtPrice: null,
                    discount: 0,
                    deliveryIncluded: true,
                    isDefault: (offers?.length ?? 0) === 0,
                    sortOrder: offers?.length ?? 0,
                    status: 'ACTIVE',
                  })
                }
              >
                <RiAddCircleLine className="w-4 h-4" /> عرض جديد
              </Button>
            </div>
          )
        }
      />
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          هذه العروض هي المصدر الوحيد للأسعار — صفحات الهبوط والطلب السريع تقرأ منها،
          فتغيير السعر هنا يصل إلى كل مكان يبيع هذا المنتج.
        </p>

        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{msg.text}</p>
        )}

        {offers === null ? (
          <p className="flex items-center gap-2 text-xs text-[var(--sys-muted-foreground)]">
            <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
          </p>
        ) : offers.length === 0 ? (
          <p className="text-xs text-[var(--sys-muted)]">
            لا عروض بعد — النموذج سيعرض سعر المنتج الأساسي فقط.
          </p>
        ) : (
          <ul className="space-y-2">
            {offers.map((o, i) => {
              const units = o.quantity + o.freeQuantity;
              const inactive = o.status !== 'ACTIVE';
              return (
                <li
                  key={o.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 ${
                    inactive
                      ? 'border-[var(--sys-border)] bg-[var(--sys-surface)] opacity-60'
                      : o.isDefault
                        ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-soft)]'
                        : 'border-[var(--sys-border)] bg-[var(--sys-card)]'
                  }`}
                >
                  {canManage && (
                    <div className="flex shrink-0 flex-col">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0 || busy}
                        className="cursor-pointer text-[var(--sys-muted)] hover:text-[var(--sys-primary)] disabled:opacity-25"
                        title="لأعلى"
                      >
                        <RiArrowUpSLine className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === offers.length - 1 || busy}
                        className="cursor-pointer text-[var(--sys-muted)] hover:text-[var(--sys-primary)] disabled:opacity-25"
                        title="لأسفل"
                      >
                        <RiArrowDownSLine className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="min-w-0 flex-1 basis-[55%]">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--sys-heading)]">
                      <span className="truncate">{o.name}</span>
                      {o.isDefault && <RiStarLine className="w-4 h-4 shrink-0 fill-[var(--sys-warning)] text-[var(--sys-warning)]" />}
                      {inactive && <RiEyeOffLine className="w-4 h-4 shrink-0 text-[var(--sys-muted)]" />}
                    </p>
                    {/* Every run of digits + Latin currency is isolated, or
                        Arabic bidi reorders "100 USD · 50 USD/قطعة" into
                        something that reads like a different price. */}
                    <p className="text-xs text-[var(--sys-muted-foreground)]">
                      {o.quantity} قطعة
                      {o.freeQuantity > 0 && <span className="text-[var(--sys-primary)]"> + {o.freeQuantity} مجاناً</span>}
                      {' — '}
                      <bdi className="font-semibold tabular-nums">{money(o.sellingPrice)}</bdi>
                      {o.compareAtPrice && o.compareAtPrice > o.sellingPrice && (
                        <> <bdi className="text-[var(--sys-muted)] line-through">{money(o.compareAtPrice)}</bdi></>
                      )}
                      {units > 1 && (
                        <span className="text-[var(--sys-muted)]">
                          {' · '}
                          <bdi>{money(o.sellingPrice / units)}</bdi> للقطعة
                        </span>
                      )}
                    </p>
                  </div>

                  {canManage && (
                    <div className="ms-auto flex shrink-0 items-center gap-1">
                      {!o.isDefault && o.status === 'ACTIVE' && (
                        <button
                          title="اجعله الافتراضي"
                          onClick={() => patch(o.id, { isDefault: true })}
                          disabled={busy}
                          className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)]"
                        >
                          <RiStarLine className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        title={inactive ? 'تفعيل' : 'إيقاف'}
                        onClick={() => patch(o.id, { status: inactive ? 'ACTIVE' : 'INACTIVE' })}
                        disabled={busy}
                        className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)]"
                      >
                        <RiEyeOffLine className="w-4 h-4" />
                      </button>
                      <button
                        title="تعديل"
                        onClick={() => setDraft({ ...o })}
                        disabled={busy}
                        className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-foreground)] hover:bg-[var(--sys-surface-strong)]"
                      >
                        <RiPencilLine className="w-4 h-4" />
                      </button>
                      <button
                        title="حذف"
                        onClick={() => remove(o.id)}
                        disabled={busy}
                        className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]"
                      >
                        <RiDeleteBinLine className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {draft && (
          <div className="space-y-2 rounded-lg border border-[var(--sys-primary)]/30 bg-[var(--sys-primary-soft)] p-3">
            <Input
              label="اسم العرض"
              placeholder="مثال: ثلاث قطع + واحدة هدية"
              value={draft.name ?? ''}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="الكمية"
                type="number" min="1" dir="ltr"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 1 })}
              />
              <Input
                label="كمية مجانية"
                type="number" min="0" dir="ltr"
                value={draft.freeQuantity ?? 0}
                onChange={(e) => setDraft({ ...draft, freeQuantity: Number(e.target.value) || 0 })}
              />
              <Input
                label={`السعر (${currency})`}
                type="number" min="0" step="0.01" dir="ltr"
                value={draft.sellingPrice}
                onChange={(e) => setDraft({ ...draft, sellingPrice: Number(e.target.value) || 0 })}
              />
              <Input
                label="السعر قبل الخصم"
                type="number" min="0" step="0.01" dir="ltr"
                placeholder="اختياري"
                value={draft.compareAtPrice ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, compareAtPrice: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
              «السعر» هو ما يدفعه الزبون فعلاً. «السعر قبل الخصم» للعرض فقط — يظهر مشطوباً
              ولا يدخل في أي حساب مال.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--sys-foreground)]">
                <input
                  type="checkbox"
                  className="accent-[var(--sys-primary)]"
                  checked={!!draft.isDefault}
                  onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
                />
                العرض الافتراضي
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--sys-foreground)]">
                <input
                  type="checkbox"
                  className="accent-[var(--sys-primary)]"
                  checked={draft.deliveryIncluded !== false}
                  onChange={(e) => setDraft({ ...draft, deliveryIncluded: e.target.checked })}
                />
                السعر شامل التوصيل
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>إلغاء</Button>
              <Button size="sm" onClick={save} disabled={busy || !draft.name?.trim()}>
                {busy ? <RiLoader4Line className="w-4 h-4 animate-spin" /> : <RiAddCircleLine className="w-4 h-4" />} حفظ العرض
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
