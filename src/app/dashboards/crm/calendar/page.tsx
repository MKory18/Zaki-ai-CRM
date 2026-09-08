'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ChevronRight, ChevronLeft, ListChecks, Handshake, FileText } from 'lucide-react';
import { crmApi } from '@/lib/crm-client';
import { formatCurrency, priorityLabels, invoiceStatusLabels } from '@/lib/crm-format';

const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [tasks, setTasks] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ kind: 'task' | 'deal' | 'invoice'; data: any } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      crmApi('/api/crm/tasks?pageSize=500').catch(() => ({ items: [] })),
      crmApi('/api/crm/deals?pageSize=500').catch(() => ({ items: [] })),
      crmApi('/api/crm/invoices?pageSize=500').catch(() => ({ items: [] })),
    ]).then(([t, d, i]) => { setTasks(t.items || []); setDeals(d.items || []); setInvoices(i.items || []); })
      .finally(() => setLoading(false));
  }, []);

  const { days, year, month } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return { days: cells, year: y, month: m };
  }, [cursor]);

  const todayKey = dayKey(new Date());

  const chipsFor = (d: Date) => {
    const k = dayKey(d);
    const t = tasks.filter((x) => x.dueDate && dayKey(new Date(x.dueDate)) === k).map((x) => ({ kind: 'task' as const, data: x }));
    const dl = deals.filter((x) => x.expectedCloseDate && dayKey(new Date(x.expectedCloseDate)) === k).map((x) => ({ kind: 'deal' as const, data: x }));
    const inv = invoices.filter((x) => x.dueDate && dayKey(new Date(x.dueDate)) === k).map((x) => ({ kind: 'invoice' as const, data: x }));
    return [...t, ...dl, ...inv];
  };

  const chipStyle = (kind: string, data: any) => {
    if (kind === 'task') return data.status === 'DONE' ? 'bg-[#e8f8ef] text-[#25b865]' : data.priority === 'URGENT' || data.priority === 'HIGH' ? 'bg-[#fbeeef] text-[#d13b4c]' : 'bg-[#eaf3ff] text-[#3e97ff]';
    if (kind === 'deal') return data.stage === 'WON' ? 'bg-[#e8f8ef] text-[#25b865]' : data.stage === 'LOST' ? 'bg-[#fbeeef] text-[#d13b4c]' : 'bg-[#f1edfb] text-[#7c5cd6]';
    return data.status === 'PAID' ? 'bg-[#e8f8ef] text-[#25b865]' : data.status === 'OVERDUE' ? 'bg-[#fbeeef] text-[#d13b4c]' : 'bg-[#fdf4e8] text-[#e49e3d]';
  };

  const chipLabel = (chip: { kind: string; data: any }) => {
    if (chip.kind === 'task') return chip.data.title;
    if (chip.kind === 'deal') return chip.data.title;
    return chip.data.invoiceNumber;
  };

  const openDetail = async (chip: { kind: string; data: any }) => {
    if (chip.kind === 'deal' && chip.data.crmContactId) {
      try { chip.data = { ...chip.data, crmContact: chip.data.crmContact }; } catch {}
    }
    setDetail({ kind: chip.kind as any, data: chip.data });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a]">التقويم</h1>
            <p className="text-xs text-[#6b7177] mt-1">المهام، الصفقات والفواتير المستحقة</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
            <span className="text-sm font-bold text-[#252f4a] min-w-[120px] text-center">{AR_MONTHS[month]} {year}</span>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>اليوم</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {AR_WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-bold text-[#6b7177] py-1">{d}</div>
              ))}
            </div>
            {loading ? (
              <p className="py-12 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {days.map((d, i) => (
                  <div key={i} className={`min-h-[110px] rounded-lg border p-1.5 ${d ? (dayKey(d) === todayKey ? 'border-[#3e97ff] bg-[#eaf3ff]/40' : 'border-[#eef0f3] bg-[#f8f9fa]') : 'border-transparent'}`}>
                    {d && <span className={`text-[11px] font-bold ${dayKey(d) === todayKey ? 'text-[#3e97ff]' : 'text-[#6b7177]'}`}>{d.getDate()}</span>}
                    <div className="mt-1 space-y-1">
                      {d && chipsFor(d).slice(0, 4).map((chip, ci) => (
                        <button
                          key={ci}
                          onClick={() => openDetail(chip)}
                          title={chipLabel(chip)}
                          className={`w-full text-right px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity ${chipStyle(chip.kind, chip.data)}`}
                        >
                          {chipLabel(chip)}
                        </button>
                      ))}
                      {d && chipsFor(d).length > 4 && (
                        <span className="text-[10px] text-[#9ca3af]">+{chipsFor(d).length - 4} أخرى</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 mt-4 text-[11px] text-[#6b7177]">
              <span className="flex items-center gap-1"><ListChecks className="w-3 h-3 text-[#3e97ff]" /> مهام</span>
              <span className="flex items-center gap-1"><Handshake className="w-3 h-3 text-[#7c5cd6]" /> صفقات</span>
              <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-[#e49e3d]" /> فواتير</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.kind === 'task' ? 'تفاصيل المهمة' : detail?.kind === 'deal' ? 'تفاصيل الصفقة' : 'تفاصيل الفاتورة'} maxWidth="md">
        {detail?.kind === 'task' && (
          <div className="p-4 bg-[#f8f9fa] rounded-xl space-y-2 text-xs">
            <p className="text-sm font-bold text-[#252f4a]">{detail.data.title}</p>
            <p className="text-[#4b5675]">{detail.data.description || '—'}</p>
            <div className="flex items-center gap-2">
              <Badge variant={priorityLabels[detail.data.priority]?.variant}>{priorityLabels[detail.data.priority]?.ar || detail.data.priority}</Badge>
              <span className="text-[#6b7177]">الاستحقاق: {new Date(detail.data.dueDate).toLocaleString('ar')}</span>
            </div>
          </div>
        )}
        {detail?.kind === 'deal' && (
          <div className="p-4 bg-[#f8f9fa] rounded-xl space-y-2 text-xs">
            <p className="text-sm font-bold text-[#252f4a]">{detail.data.title}</p>
            <p className="font-bold text-[#252f4a]">{formatCurrency(detail.data.value, detail.data.currency)}</p>
            <p className="text-[#6b7177]">الإغلاق المتوقع: {new Date(detail.data.expectedCloseDate).toLocaleDateString('ar')} • الاحتمالية {detail.data.probability ?? 0}%</p>
            {detail.data.crmContact && <p className="text-[#4b5675]">جهة الاتصال: {detail.data.crmContact.firstName} {detail.data.crmContact.lastName}</p>}
          </div>
        )}
        {detail?.kind === 'invoice' && (
          <div className="p-4 bg-[#f8f9fa] rounded-xl space-y-2 text-xs">
            <p className="text-sm font-bold text-[#252f4a]">{detail.data.invoiceNumber}</p>
            <p className="font-bold text-[#252f4a]">{formatCurrency(detail.data.total, detail.data.currency)}</p>
            <div className="flex items-center gap-2">
              <Badge variant={invoiceStatusLabels[detail.data.status]?.variant}>{invoiceStatusLabels[detail.data.status]?.ar || detail.data.status}</Badge>
              <span className="text-[#6b7177]">الاستحقاق: {new Date(detail.data.dueDate).toLocaleDateString('ar')}</span>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
