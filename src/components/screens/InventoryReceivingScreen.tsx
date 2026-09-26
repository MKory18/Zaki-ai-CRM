'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { RiInboxArchiveLine, RiLoader4Line, RiSearchLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

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
}

export function InventoryReceivingScreen() {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [term, setTerm] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [active, setActive] = useState<ProductRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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
        />

      {rows.length === 0 && (products?.length ?? 0) > 0 && !term && !onlyEmpty && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-6 text-center text-sm text-[var(--sys-muted-foreground)]">
          لا منتجات جاهزة بعد — كل منتجاتك مصنّعة. يُحدَّد النوع عند إضافة المنتج،
          ويمكن تغييره من صفحة المنتج.
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
              className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--sys-border)] text-sm"
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

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
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
                    </button></>
            )}
          />
          {rows.length > 100 && (
            <p className="text-xs text-[var(--sys-muted)] px-3 py-2 border-t border-[var(--sys-border)]">
              يعرض أول 100 من {rows.length} — ضيّق البحث.
            </p>
          )}
        </div>
      )}

      {active && (
        <ReceiveDialog
          product={active}
          onClose={() => setActive(null)}
          onSaved={async (message) => {
            setActive(null);
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
                unitCost: unitCost ? Number(unitCost) : 0,
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
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">تكلفة الوحدة في هذه الدفعة (اختياري)</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
          <span className="block text-xs text-[var(--sys-muted)] mt-1">
            تُفتح دفعة جديدة بهذه التكلفة، فلا تتأثر تكلفة البضاعة القديمة.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملاحظة</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: وصلت من المورّد"
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الاستلام…' : 'استلام'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
