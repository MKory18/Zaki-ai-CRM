'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Pencil, Trash2, UserPlus, ChevronRight, ChevronLeft, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { crmApi, qs, fetchAssignableUsers } from '@/lib/crm-client';
import { formatDate, formatCurrency, leadStatusLabels, leadSourceLabels, activityTypeLabels, currencyOptions } from '@/lib/crm-format';

const emptyForm = { firstName: '', lastName: '', companyName: '', email: '', phone: '', source: 'MANUAL', status: 'NEW', score: 0, assignedToId: '', notes: '' };

export default function LeadsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [converting, setConverting] = useState<any>(null);
  const [convertDealValue, setConvertDealValue] = useState('');
  const [convertCurrency, setConvertCurrency] = useState('USD');
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertResult, setConvertResult] = useState<{ contactId: string; dealId?: string } | null>(null);

  const [selected, setSelected] = useState<any>(null);
  const [related, setRelated] = useState<{ activities: any[]; notes: any[] }>({ activities: [], notes: [] });
  const [relatedLoading, setRelatedLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/leads${qs({ q: search, status, source, page, pageSize: 10 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load(); }, 250);
    return () => clearTimeout(timer);
  }, [search, status, source]);
  useEffect(() => { load(); }, [page]);
  useEffect(() => { fetchAssignableUsers().then(setUsers).catch(() => {}); }, []);

  const loadRelated = async (id: string) => {
    setRelatedLoading(true);
    try {
      const [activities, notes] = await Promise.all([
        crmApi(`/api/crm/activities?crmLeadId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/notes?crmLeadId=${id}&pageSize=50`).catch(() => ({ items: [] })),
      ]);
      setRelated({ activities: activities.items || [], notes: notes.items || [] });
    } finally { setRelatedLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };
  const openEdit = (l: any) => {
    setEditing(l);
    setForm({
      firstName: l.firstName || '', lastName: l.lastName || '', companyName: l.companyName || '', email: l.email || '',
      phone: l.phone || '', source: l.source || 'MANUAL', status: l.status || 'NEW', score: l.score ?? 0,
      assignedToId: l.assignedToId || '', notes: l.notes || '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'الاسم الأول مطلوب';
    if (!form.phone.trim()) e.phone = 'رقم الهاتف مطلوب';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'صيغة البريد الإلكتروني غير صحيحة';
    if (form.score < 0 || form.score > 100) e.score = 'الدرجة بين 0 و 100';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setApiError(null);
    try {
      const payload = { ...form, score: Number(form.score) || 0, assignedToId: form.assignedToId || null };
      if (editing) await crmApi(`/api/crm/leads/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await crmApi('/api/crm/leads', { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/leads/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const openConvert = (l: any) => { setConverting(l); setConvertDealValue(''); setConvertCurrency('USD'); setConvertError(null); setConvertResult(null); };

  const handleConvert = async () => {
    if (!converting) return;
    setConvertLoading(true); setConvertError(null);
    try {
      const body: any = { createDeal: !!convertDealValue };
      if (convertDealValue) {
        const v = Number(convertDealValue);
        if (isNaN(v) || v <= 0) throw new Error('قيمة الصفقة يجب أن تكون رقماً موجباً');
        body.dealValue = v;
        body.currency = convertCurrency;
      }
      const res = await crmApi(`/api/crm/leads/${converting.id}/convert`, { method: 'POST', body: JSON.stringify(body) });
      setConvertResult({ contactId: res.contact?.id, dealId: res.deal?.id });
      load();
    } catch (err: any) { setConvertError(err.message); }
    finally { setConvertLoading(false); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">العملاء المحتملون</h1>
            <p className="text-xs text-[#697586] mt-1">تتبع العملاء المحتملين وتحويلهم إلى جهات اتصال</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>إضافة عميل محتمل</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input type="text" placeholder="بحث بالاسم، الشركɡ الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]" />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
                <option value="all">كل الحالات</option>
                {Object.entries(leadStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
              <Select value={source} onChange={(e) => setSource(e.target.value)} className="max-w-[180px]">
                <option value="all">كل المصادر</option>
                {Object.entries(leadSourceLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e3e8ef]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['الاسم', 'الشركة', 'المصدر', 'الحالة', 'الدرجة', 'المسؤول', 'تاريخ الإنشاء', 'إجراءات'].map((h) => (
                      <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef] bg-white">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</td></tr>
                  ) : !items.length ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</td></tr>
                  ) : items.map((l) => (
                    <tr key={l.id} className="hover:bg-[#f8fafc] cursor-pointer transition-colors" onClick={() => { setSelected(l); loadRelated(l.id); }}>
                      <td className="px-4 py-3 font-semibold text-[#121926]">{l.firstName} {l.lastName}</td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{l.companyName || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={leadSourceLabels[l.source]?.variant || 'default'}>{leadSourceLabels[l.source]?.ar || l.source}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={leadStatusLabels[l.status]?.variant || 'default'}>{leadStatusLabels[l.status]?.ar || l.status}</Badge></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${l.score >= 70 ? 'text-[#00c853]' : l.score >= 40 ? 'text-[#ffab00]' : 'text-[#9ca3af]'}`}>{l.score ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{l.assignedTo?.name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#697586]">{formatDate(l.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {l.status !== 'CONVERTED' && (
                            <Button variant="ghost" size="sm" onClick={() => openConvert(l)} title="تحويل">
                              <ArrowLeftRight className="w-3.5 h-3.5 text-[#00c853]" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEdit(l)}><Pencil className="w-3.5 h-3.5 text-[#b8256e]" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(l)}><Trash2 className="w-3.5 h-3.5 text-[#fb323f]" /></Button>
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

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل عميل محتمل' : 'إضافة عميل محتمل'} maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{apiError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="الاسم الأول *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} error={errors.firstName} />
            <Input label="اسم العائلة" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="الشركة" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <Input label="رقم الهاتف *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
            <Input label="الدرجة (0-100)" type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} error={errors.score} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="المصدر" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {Object.entries(leadSourceLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Select label="الحالة" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(leadStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Select label="المسؤول" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
              <option value="">— بدون —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      {/* Convert Modal */}
      <Modal isOpen={!!converting} onClose={() => setConverting(null)} title="تحويل العميل المحتمل" subtitle={converting ? `${converting.firstName} ${converting.lastName}` : ''} maxWidth="md">
        {convertResult ? (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-[#00c853] mx-auto" />
            <p className="text-sm font-semibold text-[#121926]">تم التحويل بنجاح!</p>
            <div className="flex justify-center gap-2">
              {convertResult.contactId && (
                <Link href="/dashboards/crm/contacts"><Button size="sm" variant="outline">فتح جهات الاتصال</Button></Link>
              )}
              <Button size="sm" onClick={() => setConverting(null)}>إغلاق</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {convertError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{convertError}</div>}
            <p className="text-sm text-[#364152]">سيتم إنشاء جهة اتصال جديدة من هذا العميل المحتمل. يمكنك اختيارياً إنشاء صفقة مرتبطة:</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="قيمة الصفقة (اختياري)" type="number" min={0} value={convertDealValue} onChange={(e) => setConvertDealValue(e.target.value)} placeholder="اتركه فارغاً لعدم إنشاء صفقة" />
              <Select label="العملة" value={convertCurrency} onChange={(e) => setConvertCurrency(e.target.value)}>
                {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConverting(null)}>إلغاء</Button>
              <Button variant="success" loading={convertLoading} onClick={handleConvert}>تحويل</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#364152]">هل أنت متأكد من حذف العميل المحتمل <span className="font-bold text-[#121926]">{deleting?.firstName} {deleting?.lastName}</span>؟</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={`${selected?.firstName || ''} ${selected?.lastName || ''}`} subtitle="ملف العميل المحتمل" maxWidth="2xl">
        {relatedLoading ? <p className="py-8 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p> : (
          <div className="space-y-4">
            <div className="p-4 bg-[#f8fafc] rounded-xl grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[#9ca3af]">الهاتف:</span><p className="font-mono font-bold text-[#121926]" dir="ltr">{selected?.phone}</p></div>
              <div><span className="text-[#9ca3af]">البريد:</span><p className="font-medium text-[#121926]" dir="ltr">{selected?.email || '—'}</p></div>
              <div><span className="text-[#9ca3af]">الشركة:</span><p className="font-medium text-[#121926]">{selected?.companyName || '—'}</p></div>
              <div><span className="text-[#9ca3af]">الدرجة:</span><p className="font-bold text-[#121926]">{selected?.score ?? 0}</p></div>
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">الأنشطة</h4>
            <div className="space-y-3">
              {related.activities.map((a) => (
                <div key={a.id} className="p-3 bg-[#f8fafc] rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={activityTypeLabels[a.type]?.variant}>{activityTypeLabels[a.type]?.ar || a.type}</Badge>
                    <span className="text-[#9ca3af]">{a.occurredAt ? new Date(a.occurredAt).toLocaleString('ar') : '—'}</span>
                  </div>
                  <p className="font-semibold text-[#121926] mt-1">{a.subject}</p>
                </div>
              ))}
              {!related.activities.length && <p className="text-xs text-[#9ca3af]">لا توجد أنشطة</p>}
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">الملاحظات</h4>
            <div className="space-y-2">
              {related.notes.map((n) => (
                <div key={n.id} className="p-3 bg-[#f8fafc] rounded-lg text-xs">
                  <p className="text-[#121926]">{n.body}</p>
                  <p className="text-[#9ca3af] mt-1">{formatDate(n.createdAt)}</p>
                </div>
              ))}
              {!related.notes.length && <p className="text-xs text-[#9ca3af]">لا توجد ملاحظات</p>}
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
