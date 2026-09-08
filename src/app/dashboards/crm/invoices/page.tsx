'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Pencil, Trash2, ChevronRight, ChevronLeft, AlertTriangle, Send, CheckCircle2, DollarSign, Eye } from 'lucide-react';
import { crmApi, qs } from '@/lib/crm-client';
import { formatCurrency, formatDate, formatDateTime, invoiceStatusLabels, isOverdue, currencyOptions } from '@/lib/crm-format';

const emptyForm = {
  invoiceNumber: '', status: 'DRAFT', currency: 'USD', taxRate: 0,
  issueDate: '', dueDate: '', notes: '',
  crmContactId: '', crmCompanyId: '',
  items: [{ description: '', quantity: 1, unitPrice: 0 }],
};

export default function InvoicesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [paymentFor, setPaymentFor] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [selected, setSelected] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/invoices${qs({ q: search, status, page, pageSize: 10 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load(); }, 250);
    return () => clearTimeout(timer);
  }, [search, status]);
  useEffect(() => { load(); }, [page]);

  useEffect(() => {
    crmApi('/api/crm/contacts?pageSize=200').then((d) => setContacts(d.items || [])).catch(() => {});
    crmApi('/api/crm/companies?pageSize=200').then((d) => setCompanies(d.items || [])).catch(() => {});
  }, []);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
    const tax = subtotal * ((Number(form.taxRate) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [form.items, form.taxRate]);

  const openCreate = () => {
    setEditing(null);
    const d = new Date();
    setForm({
      ...emptyForm,
      issueDate: d.toISOString().slice(0, 10),
      invoiceNumber: '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const openEdit = (inv: any) => {
    setEditing(inv);
    setForm({
      invoiceNumber: inv.invoiceNumber || '', status: inv.status || 'DRAFT', currency: inv.currency || 'USD',
      taxRate: inv.taxRate ?? 0, issueDate: inv.issueDate ? inv.issueDate.slice(0, 10) : '',
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '', notes: inv.notes || '',
      crmContactId: inv.crmContactId || '', crmCompanyId: inv.crmCompanyId || '',
      items: (inv.items || []).length ? inv.items.map((it: any) => ({ description: it.description || '', quantity: it.quantity ?? 1, unitPrice: it.unitPrice ?? 0 })) : [{ description: '', quantity: 1, unitPrice: 0 }],
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.invoiceNumber.trim()) e.invoiceNumber = 'رقم الفاتورة مطلوب';
    if (!form.dueDate) e.dueDate = 'تاريخ الاستحقاق مطلوب';
    const badItem = form.items.find((it: any) => !it.description.trim() || Number(it.quantity) <= 0 || Number(it.unitPrice) < 0);
    if (badItem) e.items = 'كل بند يحتاج وصفاً وكمية موجبة وسعراً صحيحاً';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setApiError(null);
    try {
      const payload: any = {
        invoiceNumber: form.invoiceNumber, status: form.status, currency: form.currency,
        taxRate: Number(form.taxRate) || 0,
        issueDate: form.issueDate || null, dueDate: form.dueDate || null, notes: form.notes,
        crmContactId: form.crmContactId || null, crmCompanyId: form.crmCompanyId || null,
        items: form.items.map((it: any) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) })),
      };
      if (editing) await crmApi(`/api/crm/invoices/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await crmApi('/api/crm/invoices', { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/invoices/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const setStatusOn = async (inv: any, newStatus: string) => {
    setItems((prev) => prev.map((x) => (x.id === inv.id ? { ...x, status: newStatus } : x)));
    try {
      await crmApi(`/api/crm/invoices/${inv.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    } catch { load(); }
  };

  const openPayment = (inv: any) => { setPaymentFor(inv); setPaymentAmount(String(inv.amountPaid || '')); setApiError(null); };

  const handlePayment = async () => {
    if (!paymentFor) return;
    const v = Number(paymentAmount);
    if (isNaN(v) || v < 0) { setApiError('المبلغ غير صالح'); return; }
    setPaymentLoading(true); setApiError(null);
    try {
      await crmApi(`/api/crm/invoices/${paymentFor.id}`, { method: 'PATCH', body: JSON.stringify({ amountPaid: v }) });
      setPaymentFor(null);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setPaymentLoading(false); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a]">الفواتير</h1>
            <p className="text-xs text-[#6b7177] mt-1">إدارة الفواتير والمدفوعات</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>فاتورة جديدة</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input type="text" placeholder="بحث برقم الفاتورة..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#eef0f3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3e97ff]/30 focus:border-[#3e97ff]" />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
                <option value="all">كل الحالات</option>
                {Object.entries(invoiceStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#eef0f3]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8f9fa]">
                  <tr>
                    {['الرقم', 'جهة الاتصال / الشركة', 'تاريخ الإصدار', 'الاستحقاق', 'الإجمالي', 'المدفوع', 'الحالة', 'إجراءات'].map((h) => (
                      <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7177]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0f3] bg-white">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</td></tr>
                  ) : !items.length ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</td></tr>
                  ) : items.map((inv) => {
                    const overdue = (inv.status === 'OVERDUE' || (inv.status === 'SENT' && isOverdue(inv.dueDate)));
                    return (
                      <tr key={inv.id} className="hover:bg-[#f8f9fa] cursor-pointer transition-colors" onClick={() => setSelected(inv)}>
                        <td className="px-4 py-3 font-bold text-[#252f4a]">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-xs text-[#4b5675]">
                          {inv.crmContact ? `${inv.crmContact.firstName} ${inv.crmContact.lastName}` : inv.company?.name || inv.crmCompany?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b7177]">{formatDate(inv.issueDate)}</td>
                        <td className={`px-4 py-3 text-xs ${overdue ? 'text-[#d13b4c] font-bold' : 'text-[#6b7177]'}`}>
                          <span className="flex items-center gap-1">
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            {formatDate(inv.dueDate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-[#252f4a]">{formatCurrency(inv.total, inv.currency)}</td>
                        <td className="px-4 py-3 text-xs text-[#25b865] font-semibold">{formatCurrency(inv.amountPaid, inv.currency)}</td>
                        <td className="px-4 py-3"><Badge variant={invoiceStatusLabels[inv.status]?.variant || 'default'}>{invoiceStatusLabels[inv.status]?.ar || inv.status}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {inv.status === 'DRAFT' && <Button variant="ghost" size="sm" title="إرسال" onClick={() => setStatusOn(inv, 'SENT')}><Send className="w-3.5 h-3.5 text-[#3e97ff]" /></Button>}
                            {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && <Button variant="ghost" size="sm" title="تسجيل دفعة" onClick={() => openPayment(inv)}><DollarSign className="w-3.5 h-3.5 text-[#25b865]" /></Button>}
                            <Button variant="ghost" size="sm" title="تفاصيل" onClick={() => setSelected(inv)}><Eye className="w-3.5 h-3.5 text-[#6b7177]" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(inv)}><Pencil className="w-3.5 h-3.5 text-[#3e97ff]" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleting(inv)}><Trash2 className="w-3.5 h-3.5 text-[#d13b4c]" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-[#6b7177]">
              <span>الإجمالي: {total}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
                <span>صفحة {page} من {pages}</span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل فاتورة' : 'فاتورة جديدة'} maxWidth="4xl">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs rounded-lg">{apiError}</div>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="رقم الفاتورة *" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} error={errors.invoiceNumber} />
            <Select label="الحالة" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(invoiceStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Input label="تاريخ الإصدار" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            <Input label="تاريخ الاستحقاق *" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} error={errors.dueDate} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="جهة الاتصال" value={form.crmContactId} onChange={(e) => setForm({ ...form, crmContactId: e.target.value })}>
              <option value="">— بدون —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </Select>
            <Select label="الشركة" value={form.crmCompanyId} onChange={(e) => setForm({ ...form, crmCompanyId: e.target.value })}>
              <option value="">— بدون —</option>
              {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </Select>
            <Select label="العملة" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>

          <div className="rounded-lg border border-[#eef0f3] p-3 space-y-2">
            <p className="text-xs font-bold text-[#252f4a]">بنود الفاتورة</p>
            {form.items.map((it: any, idx: number) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Input placeholder="الوصف" value={it.description} onChange={(e) => {
                    const items = [...form.items]; items[idx] = { ...it, description: e.target.value }; setForm({ ...form, items });
                  }} />
                </div>
                <div className="col-span-2">
                  <Input type="number" min={0} step="any" placeholder="الكمية" value={it.quantity} onChange={(e) => {
                    const items = [...form.items]; items[idx] = { ...it, quantity: e.target.value }; setForm({ ...form, items });
                  }} />
                </div>
                <div className="col-span-3">
                  <Input type="number" min={0} step="any" placeholder="سعر الوحدة" value={it.unitPrice} onChange={(e) => {
                    const items = [...form.items]; items[idx] = { ...it, unitPrice: e.target.value }; setForm({ ...form, items });
                  }} />
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="sm" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) })}>
                    <Trash2 className="w-3.5 h-3.5 text-[#d13b4c]" />
                  </Button>
                </div>
              </div>
            ))}
            {errors.items && <p className="text-xs text-[#d13b4c]">{errors.items}</p>}
            <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unitPrice: 0 }] })} className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة بند</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="الضريبة (%)" type="number" min={0} step="any" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            <div className="p-3 bg-[#f8f9fa] rounded-lg text-xs space-y-1 self-end">
              <div className="flex justify-between"><span className="text-[#6b7177]">المجموع الفرعي:</span><span className="font-bold text-[#252f4a]">{formatCurrency(totals.subtotal, form.currency)}</span></div>
              <div className="flex justify-between"><span className="text-[#6b7177]">الضريبة:</span><span className="font-bold text-[#252f4a]">{formatCurrency(totals.tax, form.currency)}</span></div>
              <div className="flex justify-between border-t border-[#eef0f3] pt-1"><span className="text-[#6b7177]">الإجمالي:</span><span className="font-bold text-[#3e97ff]">{formatCurrency(totals.total, form.currency)}</span></div>
            </div>
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!paymentFor} onClose={() => setPaymentFor(null)} title="تسجيل دفعة" subtitle={paymentFor?.invoiceNumber} maxWidth="sm">
        {apiError && <div className="p-3 bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs rounded-lg mb-3">{apiError}</div>}
        <Input label={`المبلغ المدفوع (الإجمالي: ${formatCurrency(paymentFor?.total, paymentFor?.currency)})`} type="number" min={0} step="any" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setPaymentFor(null)}>إلغاء</Button>
          <Button variant="success" loading={paymentLoading} onClick={handlePayment}>تسجيل</Button>
        </div>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#4b5675]">هل أنت متأكد من حذف الفاتورة <span className="font-bold text-[#252f4a]">{deleting?.invoiceNumber}</span>؟</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.invoiceNumber || ''} subtitle="تفاصيل الفاتورة" maxWidth="lg">
        <div className="space-y-4">
          <div className="p-4 bg-[#f8f9fa] rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-[#9ca3af]">الإصدار:</span><p className="font-medium text-[#252f4a]">{formatDate(selected?.issueDate)}</p></div>
            <div><span className="text-[#9ca3af]">الاستحقاق:</span><p className="font-medium text-[#252f4a]">{formatDate(selected?.dueDate)}</p></div>
            <div><span className="text-[#9ca3af]">الإجمالي:</span><p className="font-bold text-[#252f4a]">{formatCurrency(selected?.total, selected?.currency)}</p></div>
            <div><span className="text-[#9ca3af]">المدفوع:</span><p className="font-bold text-[#25b865]">{formatCurrency(selected?.amountPaid, selected?.currency)}</p></div>
            <div className="col-span-2"><Badge variant={invoiceStatusLabels[selected?.status]?.variant}>{invoiceStatusLabels[selected?.status]?.ar || selected?.status}</Badge></div>
          </div>
          <div className="divide-y divide-[#eef0f3]">
            {(selected?.items || []).map((it: any, i: number) => (
              <div key={i} className="py-2 flex items-center justify-between text-xs">
                <span className="text-[#252f4a]">{it.description} × {it.quantity}</span>
                <span className="font-bold text-[#252f4a]">{formatCurrency((it.quantity || 0) * (it.unitPrice || 0), selected?.currency)}</span>
              </div>
            ))}
          </div>
          {selected?.notes && <p className="text-xs text-[#6b7177] bg-[#f8f9fa] p-3 rounded-lg">{selected.notes}</p>}
        </div>
      </Modal>
    </AppLayout>
  );
}
