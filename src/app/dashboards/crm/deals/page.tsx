'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Pencil, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import { crmApi, qs, fetchAssignableUsers } from '@/lib/crm-client';
import { formatDate, formatCurrency, stageLabels, currencyOptions, activityTypeLabels, taskStatusLabels, priorityLabels } from '@/lib/crm-format';

const emptyForm = {
  title: '', value: '', currency: 'USD', stage: 'NEW', probability: 50, expectedCloseDate: '',
  crmContactId: '', crmCompanyId: '', assignedToId: '', notes: '',
};

export default function DealsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
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
  const [related, setRelated] = useState<{ activities: any[]; notes: any[]; tasks: any[] }>({ activities: [], notes: [], tasks: [] });
  const [relatedLoading, setRelatedLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/deals${qs({ q: search, stage, page, pageSize: 10 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load(); }, 250);
    return () => clearTimeout(timer);
  }, [search, stage]);
  useEffect(() => { load(); }, [page]);

  useEffect(() => {
    crmApi('/api/crm/contacts?pageSize=200').then((d) => setContacts(d.items || [])).catch(() => {});
    crmApi('/api/crm/companies?pageSize=200').then((d) => setCompanies(d.items || [])).catch(() => {});
    fetchAssignableUsers().then(setUsers).catch(() => {});
  }, []);

  const loadRelated = async (id: string) => {
    setRelatedLoading(true);
    try {
      const [activities, notes, tasks] = await Promise.all([
        crmApi(`/api/crm/activities?crmDealId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/notes?crmDealId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/tasks?crmDealId=${id}&pageSize=50`).catch(() => ({ items: [] })),
      ]);
      setRelated({ activities: activities.items || [], notes: notes.items || [], tasks: tasks.items || [] });
    } finally { setRelatedLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };
  const openEdit = (d: any) => {
    setEditing(d);
    setForm({
      title: d.title || '', value: d.value ?? '', currency: d.currency || 'USD', stage: d.stage || 'NEW',
      probability: d.probability ?? 50, expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.slice(0, 10) : '',
      crmContactId: d.crmContactId || '', crmCompanyId: d.crmCompanyId || '', assignedToId: d.assignedToId || '', notes: d.notes || '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'عنوان الصفقة مطلوب';
    const v = Number(form.value);
    if (!form.value || isNaN(v) || v <= 0) e.value = 'القيمة يجب أن تكون رقماً موجباً';
    if (form.probability < 0 || form.probability > 100) e.probability = 'الاحتمالية بين 0 و 100';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setApiError(null);
    try {
      const payload: any = {
        title: form.title, value: Number(form.value), currency: form.currency, stage: form.stage,
        probability: Number(form.probability),
        expectedCloseDate: form.expectedCloseDate || null,
        crmContactId: form.crmContactId || null,
        crmCompanyId: form.crmCompanyId || null,
        assignedToId: form.assignedToId || null,
        notes: form.notes,
      };
      if (editing) await crmApi(`/api/crm/deals/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await crmApi('/api/crm/deals', { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/deals/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">الصفقات</h1>
            <p className="text-xs text-[#697586] mt-1">إدارة الصفقات ومتابعة مراحلها</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>إضافة صفقة</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input type="text" placeholder="بحث بعنوان الصفقة..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]" />
              </div>
              <Select value={stage} onChange={(e) => setStage(e.target.value)} className="max-w-[180px]">
                <option value="all">كل المراحل</option>
                {Object.entries(stageLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e3e8ef]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['العنوان', 'القيمة', 'المرحلة', 'الاحتمالية', 'تاريخ الإغلاق المتوقع', 'جهة الاتصال', 'الشركة', 'المسؤول', 'إجراءات'].map((h) => (
                      <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef] bg-white">
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</td></tr>
                  ) : !items.length ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</td></tr>
                  ) : items.map((d) => (
                    <tr key={d.id} className="hover:bg-[#f8fafc] cursor-pointer transition-colors" onClick={() => { setSelected(d); loadRelated(d.id); }}>
                      <td className="px-4 py-3 font-semibold text-[#121926]">{d.title}</td>
                      <td className="px-4 py-3 text-xs font-bold text-[#121926]">{formatCurrency(d.value, d.currency)}</td>
                      <td className="px-4 py-3"><Badge variant={stageLabels[d.stage]?.variant || 'default'}>{stageLabels[d.stage]?.ar || d.stage}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#e3e8ef] rounded-full overflow-hidden">
                            <div className="h-full bg-[#b8256e] rounded-full" style={{ width: `${d.probability ?? 0}%` }} />
                          </div>
                          <span className="text-xs text-[#697586]">{d.probability ?? 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#697586]">{formatDate(d.expectedCloseDate)}</td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{d.crmContact ? `${d.crmContact.firstName} ${d.crmContact.lastName}` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{d.company?.name || d.crmCompany?.name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#364152]">{d.assignedTo?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5 text-[#b8256e]" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(d)}><Trash2 className="w-3.5 h-3.5 text-[#fb323f]" /></Button>
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

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل صفقة' : 'إضافة صفقة'} maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{apiError}</div>}
          <Input label="عنوان الصفقة *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="القيمة *" type="number" min={0} step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} error={errors.value} />
            <Select label="العملة" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="المرحلة" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {Object.entries(stageLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Input label="تاريخ الإغلاق المتوقع" type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#121926] mb-1.5">الاحتمالية: {form.probability}%</label>
            <input type="range" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })}
              className="w-full accent-[#b8256e] cursor-pointer" />
            {errors.probability && <p className="text-xs text-[#fb323f] mt-1">{errors.probability}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="جهة الاتصال" value={form.crmContactId} onChange={(e) => setForm({ ...form, crmContactId: e.target.value })}>
              <option value="">— بدون —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </Select>
            <Select label="الشركة" value={form.crmCompanyId} onChange={(e) => setForm({ ...form, crmCompanyId: e.target.value })}>
              <option value="">— بدون —</option>
              {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </Select>
          </div>
          <Select label="المسؤول" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
            <option value="">— بدون —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Textarea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#364152]">هل أنت متأكد من حذف الصفقة <span className="font-bold text-[#121926]">{deleting?.title}</span>؟</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} subtitle="ملف الصفقة" maxWidth="2xl">
        {relatedLoading ? <p className="py-8 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p> : (
          <div className="space-y-4">
            <div className="p-4 bg-[#f8fafc] rounded-xl grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[#9ca3af]">القيمة:</span><p className="font-bold text-[#121926]">{formatCurrency(selected?.value, selected?.currency)}</p></div>
              <div><span className="text-[#9ca3af]">المرحلة:</span><p className="font-medium text-[#121926]">{stageLabels[selected?.stage]?.ar || selected?.stage}</p></div>
              <div><span className="text-[#9ca3af]">الاحتمالية:</span><p className="font-medium text-[#121926]">{selected?.probability ?? 0}%</p></div>
              <div><span className="text-[#9ca3af]">الإغلاق المتوقع:</span><p className="font-medium text-[#121926]">{formatDate(selected?.expectedCloseDate)}</p></div>
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">سجل الأنشطة</h4>
            <div className="space-y-3 border-r border-[#e3e8ef] pr-4">
              {related.activities.map((a) => (
                <div key={a.id} className="relative">
                  <span className="absolute -right-[22px] top-1.5 w-2 h-2 rounded-full bg-[#b8256e]" />
                  <div className="flex items-center gap-2">
                    <Badge variant={activityTypeLabels[a.type]?.variant}>{activityTypeLabels[a.type]?.ar || a.type}</Badge>
                    <span className="text-[11px] text-[#9ca3af]">{a.occurredAt ? new Date(a.occurredAt).toLocaleString('ar') : '—'}</span>
                  </div>
                  <p className="text-xs font-semibold text-[#121926] mt-0.5">{a.subject}</p>
                  {a.description && <p className="text-[11px] text-[#697586]">{a.description}</p>}
                </div>
              ))}
              {!related.activities.length && <p className="text-xs text-[#9ca3af]">لا توجد أنشطة</p>}
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">المهام</h4>
            <div className="divide-y divide-[#e3e8ef]">
              {related.tasks.map((task) => (
                <div key={task.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-[#121926]">{task.title}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={priorityLabels[task.priority]?.variant}>{priorityLabels[task.priority]?.ar || task.priority}</Badge>
                    <Badge variant={taskStatusLabels[task.status]?.variant}>{taskStatusLabels[task.status]?.ar || task.status}</Badge>
                  </span>
                </div>
              ))}
              {!related.tasks.length && <p className="text-xs text-[#9ca3af]">لا توجد مهام</p>}
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">الملاحظات</h4>
            <div className="space-y-2">
              {related.notes.map((n) => (
                <div key={n.id} className="p-3 bg-[#f8fafc] rounded-lg text-xs">
                  <p className="text-[#121926]">{n.body}</p>
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
