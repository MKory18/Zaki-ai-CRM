'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, Loader2, PackageCheck } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /ops/preparation — grouped BY PRODUCT, collapsible. Orders, required,
 * available and shortage all come from the API; the screen adds nothing.
 */

interface Line {
  orderId: string;
  orderNumber: string;
  customerName: string;
  regionName: string | null;
  quantity: number;
  freeQuantity: number;
  reservedQty: number;
  shippingStatus: string;
}

interface Group {
  productId: string;
  productName: string;
  orders: number;
  required: number;
  available: number;
  shortage: number;
  lines: Line[];
}

export function PreparationScreen() {
  const [data, setData] = useState<{ allowNegativeStock: boolean; totals: { products: number; orders: number; shortages: number }; groups: Group[] } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiJson('/api/ops/preparation'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <Kpi label="منتجات للتجهيز" value={data.totals.products} />
        <Kpi label="طلبات" value={data.totals.orders} />
        <Kpi label="نواقص" value={data.totals.shortages} danger={data.totals.shortages > 0} />
        <span className="text-xs text-[#697586] self-center">
          {data.allowNegativeStock ? 'المخزون السالب مسموح مع تنبيه' : 'المخزون السالب ممنوع — النقص يمنع الشحن'}
        </span>
      </div>

      {data.groups.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد طلبات مؤكدة بانتظار التجهيز.
        </p>
      )}

      {data.groups.map((g) => (
        <section key={g.productId} className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <button
            onClick={() => setOpen((o) => ({ ...o, [g.productId]: !o[g.productId] }))}
            className="w-full flex items-center gap-3 p-4 text-right hover:bg-[#f8fafc]"
          >
            <span className="w-9 h-9 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
              <PackageCheck className="w-4 h-4 text-[#b8256e]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-[#121926] truncate">{g.productName}</span>
              <span className="block text-xs text-[#697586]">
                {g.orders} طلب · مطلوب {g.required} · متاح {g.available}
                {g.shortage > 0 && <span className="text-[#fb323f]"> · نقص {g.shortage}</span>}
              </span>
            </span>
            {open[g.productId] ? <ChevronDown className="w-4 h-4 text-[#697586]" /> : <ChevronLeft className="w-4 h-4 text-[#697586]" />}
          </button>

          {open[g.productId] && (
            <table className="w-full text-sm border-t border-[#e3e8ef]">
              <thead className="bg-[#f8fafc] text-[#697586] text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-2">الطلب</th>
                  <th className="text-right font-medium px-4 py-2">العميل</th>
                  <th className="text-right font-medium px-4 py-2">المحافظة</th>
                  <th className="text-right font-medium px-4 py-2">الكمية</th>
                  <th className="text-right font-medium px-4 py-2">محجوز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e3e8ef]">
                {g.lines.map((l) => (
                  <tr key={l.orderId}>
                    <td className="px-4 py-2 font-medium text-[#121926]" dir="ltr">{l.orderNumber}</td>
                    <td className="px-4 py-2 text-[#364152]">{l.customerName}</td>
                    <td className="px-4 py-2 text-[#697586]">{l.regionName ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {l.quantity}
                      {l.freeQuantity > 0 && ` (+${l.freeQuantity})`}
                    </td>
                    <td className={`px-4 py-2 tabular-nums ${l.reservedQty >= l.quantity + l.freeQuantity ? 'text-[#00a344]' : 'text-[#fb323f]'}`}>
                      {l.reservedQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`px-4 py-2 rounded-[8px] border ${danger ? 'bg-[#feecee] border-[#fecdd1]' : 'bg-white border-[#e3e8ef]'}`}>
      <p className="text-xs text-[#697586]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${danger ? 'text-[#fb323f]' : 'text-[#121926]'}`}>{value}</p>
    </div>
  );
}
