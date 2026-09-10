'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Pencil, Trash2, Building2, ChevronRight, ChevronLeft } from 'lucide-react';
import { crmApi, qs } from '@/lib/crm-client';
import { formatCurrency, formatDate, companyStatusLabels, companySizeLabels, stageLabels, invoiceStatusLabels } from '@/lib/crm-format';

const emptyForm = { name: '', industry: '', size: 'MEDIUM', status: 'PROSPECT', website: '', phone: '', email: '', city: '', country: 'سوريا', notes: '' };

type Tab = 'info' | 'contacts' | 'deals' | 'invoices';

export default function CompaniesPage() {
  const [items, setItems] = useState<any[]>([]);
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

  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('info');
  const [related, setRelated] = useState<{ contacts: any[]; deals: any[]; invoices: any[] }>({ contacts: [], deals: [], invoices: [] });
  const [relatedLoading, setRelatedLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/companies${qs({ q: search, status, page, pageSize: 10 })}`);
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

  const loadRelated = async (id: string) => {
    setRelatedLoading(true);
    try {
      const [contacts, deals, invoices] = await Promise.all([
        crmApi(`/api/crm/contacts?crmCompanyId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/deals?crmCompanyId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/invoices?crmCompanyId=${id}&pageSize=50`).catch(() => ({ items: [] })),
      ]);
      setRelated({ contacts: contacts.items || [], deals: deals.items || [], invoices: invoices.items || [] });
    } finally { setRelatedLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({
      name: c.name || '', industry: c.industry || '', size: c.size || 'MEDIUM', status: c.status || 'PROSPECT',
      website: c.website || '', phone: c.phone || '', email: c.email || '', city: c.city || '', country: c.country || '', notes: c.notes || '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'اسم الشركة مطلوب';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'صيغة البريد الإلكتروني غير صحيحة';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setApiError(null);
    try {
      if (editing) await crmApi(`/api/crm/companies/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await crmApi('/api/crm/companies', { method: 'POST', body: JSON.stringify(form) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/companies/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'contacts', label: `جهات الاتصال (${related.contacts.length})` },
    { key: 'deals', label: `الصفقات (${related.deals.length})` },
    { key: 'invoices', label: `الفواتير (${related.invoices.length})` },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">الشركات</h1>
            <p className="text-xs text-[#697586] mt-1">إدارة الشركات والعملاء المؤسسيين</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>إضافة شركة</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input type="text" placeholder="بحث بالاسم، المدينة..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]" />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
                <option value="all">كل الحالات</option>
                {Object.entries(companyStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e3e8ef]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['الشركة', 'المجال', 'الحجم', 'المدينة', 'الحالة', 'جهات الاتصال', 'تاريخ الإنشاء', 'إجراءات'].map((h) => (
                      <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef] bg-white">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</td></tr>
                  ) : !items.length ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</td></tr>
                  ) : items.map((c) => (
                    <tr key={c.id} className="hover:bg-[#f8fafc] cursor-pointer transition-colors" onClick={() => { setSelected(c); setTab('info'); loadRelated(c.id); }}>
                      <td className="px-4 py-3 font-semibold text-[#121926]">
                        <span className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-[#fdf5fa] text-[#b8256e] flex items-center justify-center"><Building2 className="w-3.5 h-3.5" /></span>
                          {c.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{c.industry || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={companySizeLabels[c.size]?.variant || 'default'}>{companySizeLabels[c.size]?.ar || c.size || '—'}</Badge></td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{c.city || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={companyStatusLabels[c.status]?.variant || 'default'}>{companyStatusLabels[c.status]?.ar || c.status}</Badge></td>
                      <td className="px-4 py-3 text-xs font-bold text-[#b8256e]">{c._count?.contacts ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#697586]">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5 text-[#b8256e]" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}><Trash2 className="w-3.5 h-3.5 text-[#fb323f]" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-[#697586]">
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

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل شركة' : 'إضافة شركة'} maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{apiError}</div>}
          <Input label="اسم الشركة *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="المجال" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            <Select label="الحجم" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}>
              {Object.entries(companySizeLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="الحالة" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(companyStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Input label="الموقع الإلكتروني" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="المدينة" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input label="الدولة" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#364152]">هل أنت متأكد من حذف شركة <span className="font-bold text-[#121926]">{deleting?.name}</span>؟ لا يمكن التراجع عن هذا الإجراء.</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name || ''} subtitle="ملف الشركة" maxWidth="2xl">
        <div className="flex gap-2 border-b border-[#e3e8ef] pb-3 mb-4 overflow-x-auto">
          {tabs.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${tab === tb.key ? 'bg-[#b8256e] text-white' : 'bg-[#f8fafc] text-[#364152] hover:bg-[#e3e8ef]'}`}>
              {tb.label}
            </button>
          ))}
        </div>
        {relatedLoading ? <p className="py-8 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p> : (
          <>
            {tab === 'info' && (
              <div className="p-4 bg-[#f8fafc] rounded-xl grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-[#9ca3af]">المجال:</span><p className="font-medium text-[#121926]">{selected?.industry || '—'}</p></div>
                <div><span className="text-[#9ca3af]">الحجم:</span><p className="font-medium text-[#121926]">{companySizeLabels[selected?.size]?.ar || '—'}</p></div>
                <div><span className="text-[#9ca3af]">المدينة:</span><p className="font-medium text-[#121926]">{selected?.city || '—'}، {selected?.country || ''}</p></div>
                <div><span className="text-[#9ca3af]">الموقع:</span><p className="font-medium text-[#121926]" dir="ltr">{selected?.website || '—'}</p></div>
                <div><span className="text-[#9ca3af]">الهاتف:</span><p className="font-mono font-bold text-[#121926]" dir="ltr">{selected?.phone || '—'}</p></div>
                <div><span className="text-[#9ca3af]">البريد:</span><p className="font-medium text-[#121926]" dir="ltr">{selected?.email || '—'}</p></div>
                <div className="col-span-2"><span className="text-[#9ca3af]">ملاحظات:</span><p className="font-medium text-[#121926]">{selected?.notes || '—'}</p></div>
              </div>
            )}
            {tab === 'contacts' && (
              <div className="divide-y divide-[#e3e8ef]">
                {related.contacts.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#121926]">{c.firstName} {c.lastName}</span>
                    <span className="text-[#697586] font-mono" dir="ltr">{c.phone}</span>
                  </div>
                ))}
                {!related.contacts.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد جهات اتصال</p>}
              </div>
            )}
            {tab === 'deals' && (
              <div className="divide-y divide-[#e3e8ef]">
                {related.deals.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#121926]">{d.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-[#121926]">{formatCurrency(d.value, d.currency)}</span>
                      <Badge variant={stageLabels[d.stage]?.variant}>{stageLabels[d.stage]?.ar || d.stage}</Badge>
                    </span>
                  </div>
                ))}
                {!related.deals.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد صفقات</p>}
              </div>
            )}
            {tab === 'invoices' && (
              <div className="divide-y divide-[#e3e8ef]">
                {related.invoices.map((inv) => (
                  <div key={inv.id} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#121926]">{inv.invoiceNumber}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-[#121926]">{formatCurrency(inv.total, inv.currency)}</span>
                      <Badge variant={invoiceStatusLabels[inv.status]?.variant}>{invoiceStatusLabels[inv.status]?.ar || inv.status}</Badge>
                    </span>
                  </div>
                ))}
                {!related.invoices.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد فواتير</p>}
              </div>
            )}
          </>
        )}
      </Modal>
    </AppLayout>
  );
}
