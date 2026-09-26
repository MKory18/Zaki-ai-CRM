'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Boxes, Factory, PackagePlus, Loader2, Lock, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';

/**
 * What this product has, what it cost, and the one door that adds more.
 *
 * Three numbers that used to live on three screens and rarely agreed:
 * what the batches hold, what open orders have spoken for, and what is
 * therefore still sellable. The third is the only one anybody acts on, and
 * it was the one nobody could see.
 *
 * The cost shown is the weighted average of the stock actually on hand.
 * A product does not have one cost — a March run at 3.20 and a June delivery
 * at 4.10 are different money on the same shelf — so the figure says which
 * blend it is rather than picking a batch and hoping.
 */

interface Stock {
  onHand: number;
  reserved: number;
  available: number;
  averageCost: number;
  nextOutCost: number;
  stockValue: number;
  batchCount: number;
  currencyCode: string;
  sourceType: 'MANUFACTURED' | 'PURCHASED';
}

export function ProductStock({ productId, canManage }: { productId: string; canManage: boolean }) {
  const [stock, setStock] = useState<Stock | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStock(await apiJson<Stock>(`/api/products/${productId}/stock`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المخزون');
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-[var(--sys-destructive)]">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!stock) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-xs text-[var(--sys-muted-foreground)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ تحميل المخزون…
        </CardContent>
      </Card>
    );
  }

  const money = (n: number) =>
    `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${stock.currencyCode}`;
  const made = stock.sourceType === 'MANUFACTURED';

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-[var(--sys-primary)]" />
            <span>المخزون والتكلفة</span>
            <span className="rounded-full bg-[var(--sys-surface-strong)] px-2 py-0.5 text-caption font-bold text-[var(--sys-foreground)]">
              {made ? 'منتج مصنّع' : 'منتج جاهز'}
            </span>
          </span>
        }
        action={
          canManage && (
            // One door, the one that fits this product. Offering both invites
            // a bought good to be entered as a production run, which puts
            // invented manufacturing costs into the cost reports.
            <Link href={made ? '/manufacturing' : '/inventory/receiving'}>
              <Button size="sm" variant="outline">
                {made ? <Factory className="h-3.5 w-3.5" /> : <PackagePlus className="h-3.5 w-3.5" />}
                {made ? 'تشغيلة إنتاج' : 'إضافة مخزون'}
              </Button>
            </Link>
          )
        }
      />
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="بالمستودع" value={String(stock.onHand)} />
          <Tile
            label="محجوز لطلبات"
            value={String(stock.reserved)}
            icon={<Lock className="h-3 w-3" />}
            tone={stock.reserved > 0 ? 'hold' : 'plain'}
          />
          <Tile
            label="متاح للبيع"
            value={String(stock.available)}
            tone={stock.available <= 0 ? 'bad' : 'good'}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Tile label="تكلفة الوحدة (متوسط مرجّح)" value={money(stock.averageCost)} />
          <Tile label="تكلفة الدفعة القادمة للخروج" value={money(stock.nextOutCost)} />
          <Tile label="قيمة المخزون" value={money(stock.stockValue)} />
        </div>

        <p className="text-caption leading-relaxed text-[var(--sys-muted-foreground)]">
          «متوسط مرجّح» يعني: كل دفعة بوزن ما تبقّى منها فعلاً. ٩٠ قطعة بـ٣ و١٠ بـ٨
          تكلفتها ٣.٥٠ للقطعة — لا ٥.٥٠. الدفعات الفارغة خارج الحساب لأنها تقول
          ماذا كلّف الماضي، لا ماذا تكلّف قطعة اليوم.
          {stock.batchCount > 0 && ` المخزون موزّع على ${stock.batchCount} دفعة.`}
        </p>

        <Link
          href="/inventory/movements"
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-[var(--sys-primary)] hover:underline"
        >
          <ArrowLeftRight className="h-3 w-3" /> سجل حركات هذا المخزون
        </Link>
      </CardContent>
    </Card>
  );
}

function Tile({
  label, value, icon, tone = 'plain',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'plain' | 'good' | 'bad' | 'hold';
}) {
  const tones = {
    plain: 'border-[var(--sys-border)] bg-[var(--sys-card)] text-[var(--sys-heading)]',
    good: 'border-[var(--sys-success-soft)] bg-[var(--sys-success-soft)] text-[var(--sys-success)]',
    bad: 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]',
    hold: 'border-[var(--sys-warning)] bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]',
  } as const;

  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="flex items-center gap-1 text-caption font-medium text-[var(--sys-muted-foreground)]">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-sm font-black tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}
