'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import {
  RiBuilding4Line,
  RiInboxArchiveLine,
  RiLoader4Line,
  RiPriceTag3Line,
  RiSearchLine,
} from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORIGIN } from '@/lib/batch-grade';

/**
 * /inventory/receiving — put stock in.
 *
 * Received units open a batch, because a batch is where units actually live:
 * on-hand is the sum of batch remainders, and anything that writes only a
 * ledger line leaves the shipment screen reporting a shortage for stock you
 * just entered. The cost you type is the cost of THIS delivery and stays
 * with its own batch, so receiving at a new price never rewrites the old
 * cost of goods.
 */

interface ProductRow {
  id: string;
  name: string;
  sku?: string | null;
  status?: string;
  sourceType?: 'MANUFACTURED' | 'PURCHASED';
  produced: number;
  sold: number;
  remaining: number;
  batchesCount: number;
  /** The newest costed price, or null when this product has never been costed. */
  lastUnitCost: number | null;
  zeroCostBatches: number;
}

export function InventoryReceivingScreen() {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [term, setTerm] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [active, setActive] = useState<ProductRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /**
   * ARRIVING FROM ONE PRODUCT, AT THAT PRODUCT.
   *
   * The owner's note: «كمان تحديث المخزون مش موجود» — pressed from a
   * product's own page, «إضافة مخزون» landed him on a list of every ready
   * product with a search box, and he had to find by name the product he had
   * just been looking at. The door was there; it did not arrive anywhere.
   *
   * `?product=<id>` opens that product's receiving dialog straight away. The
   * link without the parameter still behaves exactly as it did, so nothing
   * pointing here breaks.
   *
   * DERIVED, NOT SET IN AN EFFECT. Writing state from an effect once the
   * rows arrive means a second render pass for something that is simply a
   * function of the URL and the list — and it has to carry a "have I already
   * done this" flag, because otherwise closing the dialog reopens it for as
   * long as the parameter stays in the address bar.
   */
  const asked = useSearchParams().get('product');
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ stockSummary: ProductRow[] }>('/api/inventory');
      setProducts(data.stockSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const linked = useMemo(() => {
    if (dismissed || !asked || !products) return { row: null, message: null as string | null };
    const row = products.find((p) => p.id === asked) ?? null;
    if (row?.sourceType === 'PURCHASED') return { row, message: null };
    // Opening the dialog for a made product anyway would end in the server's
    // WRONG_DOOR after the quantity had already been typed.
    return {
      row: null,
      message: row
        ? `«${row.name}» منتج مصنّع — تُضاف كميته من «تشغيلات الإنتاج» ببنود كلفتها، لا من هنا.`
        : 'لم يُعثر على هذا المنتج في هذا المتجر.',
    };
  }, [asked, products, dismissed]);

  /** The dialog the reader opened, or the one the link asked for. */
  const shown = active ?? linked.row;

  const rows = useMemo(() => {
    const q = term.trim();
    return (products ?? [])
      // This screen is the door for what you BUY ready. What you make comes
      // in through a production run, where its costs are broken down; the
      // server refuses the other way round in any case.
      .filter((p) => p.sourceType === 'PURCHASED')
      .filter((p) => (q ? p.name.includes(q) : true))
      .filter((p) => (onlyEmpty ? p.remaining <= 0 : true));
  }, [products, term, onlyEmpty]);

  const emptyCount = (products ?? [])
    .filter((p) => p.sourceType === 'PURCHASED')
    .filter((p) => p.remaining <= 0).length;

  return (
    <div className="max-w-5xl space-y-3">
      <PageHeader title="استلام بضاعة جاهزة"
          description="الباب الذي تدخل منه بضاعة المنتجات التي تشتريها جاهزة، بسعر شرائها. ما تصنّعه بنفسك يدخل من «تشغيلات الإنتاج» ببنود كلفته — ولهذا لا يظهر هنا."
          actions={
            <>
              {/* «في استلام بضاعة جاهزة، ضيف زر يوديني على المنتجات» — a
                  product's type is what decides which of the two doors it
                  comes in through, and the type is set on the product page.
                  Being told that with no way to get there is the whole
                  complaint. */}
              <Link
                href="/products"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-3 text-sm font-medium text-[var(--sys-foreground)] hover:bg-[var(--sys-surface)] md:h-10"
              >
                <RiPriceTag3Line className="h-4 w-4" />
                المنتجات
              </Link>
              <Link
                href="/manufacturing"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-3 text-sm font-medium text-[var(--sys-foreground)] hover:bg-[var(--sys-surface)] md:h-10"
              >
                <RiBuilding4Line className="h-4 w-4" />
                تشغيلات الإنتاج
              </Link>
            </>
          }
        />

      {/*
        WHERE WHAT YOU RECEIVE HERE SHOWS UP AFTERWARDS.

        The owner's note: «ليش المنتجات الجاهزة موجودة بتشغيلات الإنتاج». This
        screen is where that happens, so this is where it is explained — in
        the SAME words the production screen uses, from `ORIGIN.RECEIVED.why`,
        because two screens explaining one fact in two wordings is how a
        reader learns to trust neither.
      */}
      <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
        كل استلام يفتح دفعةً باسمه، وتظهر تلك الدفعة في قائمة «تشغيلات الإنتاج» موسومةً بأنها
        استلام لا تشغيلة: {ORIGIN.RECEIVED.why}
      </p>

      {rows.length === 0 && (products?.length ?? 0) > 0 && !term && !onlyEmpty && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-6 text-center text-sm text-[var(--sys-muted-foreground)]">
          لا منتجات جاهزة بعد — كل منتجاتك مصنّعة. يُحدَّد النوع عند إضافة المنتج،
          ويمكن تغييره من صفحة المنتج.{' '}
          {/* The sentence named the place to go and did not go there. */}
          <Link href="/products" className="font-semibold text-[var(--sys-primary)] hover:underline">
            اذهب إلى المنتجات
          </Link>
        </p>
      )}

      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ابحث عن المنتج</span>
          <div className="relative">
            <RiSearchLine className="w-4 h-4 text-[var(--sys-muted)] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
              placeholder="اسم المنتج"
              className="w-full h-11 md:h-10 pr-9 pl-3 rounded-lg border border-[var(--sys-border-input)] text-sm"
            />
          </div>
        </label>
        <label className="flex items-center gap-2 h-10 text-sm text-[var(--sys-foreground)]">
          <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
          بدون رصيد فقط
          {emptyCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/40 text-[var(--sys-warning)] tabular-nums">
              {emptyCount}
            </span>
          )}
        </label>
      </div>

      {(error ?? linked.message) && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error ?? linked.message}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

      {!products ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
          لا منتجات مطابقة.
        </p>
      ) : (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
                    <Rows
            rows={rows.slice(0, 100)}
            keyOf={(p) => p.id}
            columns={[
              { key: 'c0', label: "المنتج", primary: true,
                render: (p) => (p.name) },
              { key: 'c1', label: "الرصيد الحالي", primary: true,
                render: (p) => (
                  <><span
                      className={`tabular-nums px-2 py-0.5 rounded-md border text-xs ${
                        p.remaining > 0
                          ? 'bg-[var(--sys-success-soft)] border-[var(--sys-success)]/40 text-[var(--sys-success)]'
                          : 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/40 text-[var(--sys-warning)]'
                      }`}
                    >
                      {p.remaining}
                    </span></>
                ) },
            ]}
            empty={
              <EmptyState
                title="لا أصنافَ في هذا الاستلام"
                why="أضِف صنفاً وكميّته لتسجيل ما وصل فعلاً. المخزون لا يتحرّك حتى يُحفظ الاستلام."
              />
            }
            actions={(p) => (
              <><button onClick={() => setActive(p)} className="text-xs text-[var(--sys-primary)] hover:underline inline-flex items-center gap-1">
                      <RiInboxArchiveLine className="w-4 h-4" /> استلام
                    </button>
                    {/* The weighted-average cost, the reserved units and the
                        type that put this product on this screen are all on
                        its own page. Reaching it used to mean going back to
                        the sidebar and searching by name. */}
                    <Link
                      href={`/products/${p.id}`}
                      className="text-xs text-[var(--sys-primary)] hover:underline inline-flex items-center gap-1"
                    >
                      <RiPriceTag3Line className="w-4 h-4" /> المنتج
                    </Link></>
            )}
          />
          {rows.length > 100 && (
            <p className="text-xs text-[var(--sys-muted)] px-3 py-2 border-t border-[var(--sys-border)]">
              يعرض أول 100 من {rows.length} — ضيّق البحث.
            </p>
          )}
        </div>
      )}

      {shown && (
        <ReceiveDialog
          product={shown}
          onClose={() => {
            setActive(null);
            // A closed dialog stays closed, even with `?product=` still in
            // the address bar.
            setDismissed(true);
          }}
          onSaved={async (message) => {
            setActive(null);
            setDismissed(true);
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ReceiveDialog({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [zeroReason, setZeroReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title={`استلام بضاعة — ${product.name}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/inventory', {
              method: 'POST',
              body: JSON.stringify({
                action: 'receive',
                productId: product.id,
                quantity: Number(quantity),
                // A BLANK IS A BLANK. Sending 0 for an empty field is how
                // this screen used to open batches at zero cost, and every
                // unit sold out of one reads as pure profit for ever. The
                // server decides what an empty price means — carry the last
                // one forward, or refuse.
                unitCost: unitCost === '' ? undefined : Number(unitCost),
                zeroCostReason: zeroReason.trim() || null,
                note: note.trim() || null,
              }),
            });
            onSaved(`أُضيفت ${quantity} وحدة إلى ${product.name}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الاستلام');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="text-sm text-[var(--sys-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3 tabular-nums">
          الرصيد الحالي: <b>{product.remaining}</b> وحدة
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الكمية المستلمة</span>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            autoFocus
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border-input)] text-sm"
            dir="ltr"
          />
        </label>

        {/*
          NOT «(اختياري)» ANY MORE.
          For a bought product this is the only place its cost is recorded —
          the product row holds `basePrice`, which is what we SELL it for.
          A blank used to become a zero, and a zero-cost batch reports every
          unit sold out of it as pure profit, for ever, with no later
          correction. What a blank means is now the server's decision, and
          the line below says which of the two it will be.
        */}
        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">
            تكلفة الوحدة في هذه الدفعة {product.lastUnitCost === null && <b className="text-[var(--sys-destructive)]">(مطلوبة)</b>}
          </span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder={product.lastUnitCost !== null ? String(product.lastUnitCost) : 'اكتب الكلفة'}
            required={product.lastUnitCost === null}
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border-input)] text-sm"
            dir="ltr"
          />
          <span className="block text-xs text-[var(--sys-muted)] mt-1">
            {product.lastUnitCost !== null ? (
              <>تُفتح دفعة جديدة بهذه التكلفة، فلا تتأثر تكلفة البضاعة القديمة. واتركها فارغةً لتدخل بكلفة آخر دفعة ({product.lastUnitCost}).</>
            ) : (
              <>لم تُسعَّر هذه البضاعة من قبل، فلا كلفةَ تُبنى عليها. تركُها فارغةً يُدخلها بصفر فيظهر كلُّ ما يُباع منها ربحاً صافياً.</>
            )}
          </span>
        </label>

        {/* A free sample is real, so the door is not shut — it asks for a sentence. */}
        {unitCost.trim() === '0' && (
          <label className="block">
            <span className="block text-xs font-medium text-[var(--sys-destructive)] mb-1">
              كلفتُها صفر — لماذا؟
            </span>
            <input
              value={zeroReason}
              onChange={(e) => setZeroReason(e.target.value)}
              placeholder="مثال: عيّنة مجّانية من المورّد"
              required
              className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-destructive-border)] text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملاحظة</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: وصلت من المورّد"
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border-input)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-11 md:h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-11 md:h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الاستلام…' : 'استلام'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
