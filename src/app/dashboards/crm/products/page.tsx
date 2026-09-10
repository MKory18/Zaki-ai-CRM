'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { Search, ExternalLink, Package } from 'lucide-react';
import { crmApi } from '@/lib/crm-client';
import { formatCurrency } from '@/lib/crm-format';

export default function CrmProductsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    crmApi('/api/products')
      .then((d) => setItems(d.products || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((p) =>
    !search || p.name?.includes(search) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const thumbSrc = (p: any) =>
    p.images?.find((i: any) => i.isPrimary)?.url || p.images?.[0]?.url || null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">المنتجات</h1>
            <p className="text-xs text-[#697586] mt-1">عرض المنتجات من متجرك للربط بالصفقات والعروض (قراءة فقط)</p>
          </div>
          <Link href="/products">
            <Button size="sm" className="flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح إدارة المنتجات</span>
            </Button>
          </Link>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <input type="text" placeholder="بحث بالاسم أو رمز المنتج..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e] shadow-[0_1px_3px_rgba(0,0,0,0.1)]" />
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="overflow-x-auto rounded-lg border border-[#e3e8ef]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['المنتج', 'رمز المنتج', 'السعر الأساسي', 'الحالة'].map((h) => (
                      <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef] bg-white">
                  {loading ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</td></tr>
                  ) : !filtered.length ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-[#9ca3af]">لا توجد منتجات</td></tr>
                  ) : filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <ProductThumb src={thumbSrc(p)} alt={p.name} size="sm" />
                          <span className="font-semibold text-[#121926]">{p.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-[#364152]" dir="ltr">{p.sku || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-[#121926]">{formatCurrency(p.basePrice, p.currency || 'USD')}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'ACTIVE' ? 'success' : p.status === 'INACTIVE' ? 'danger' : 'default'}>
                          {p.status === 'ACTIVE' ? 'نشط' : p.status === 'INACTIVE' ? 'غير نشط' : p.status || '—'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
