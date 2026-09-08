'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Pencil, Trash2, Phone, Mail, ChevronRight, ChevronLeft } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { crmApi, qs, fetchAssignableUsers } from '@/lib/crm-client';
import { formatCurrency, formatDate, formatDateTime, activityTypeLabels, priorityLabels, stageLabels, taskStatusLabels } from '@/lib/crm-format';

type Tab = 'info' | 'deals' | 'tasks' | 'activities' | 'notes';

const emptyForm = {
  firstName: '', lastName: '', email: '', phone: '', position: '', crmCompanyId: '', notes: '',
};

export default function ContactsPage() {
  const { t } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
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
  const [related, setRelated] = useState<{ deals: any[]; tasks: any[]; activities: any[]; notes: any[] }>({ deals: [], tasks: [], activities: [], notes: [] });
  const [relatedLoading, setRelatedLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/contacts${qs({ q: search, status, sort, dir, page, pageSize: 10 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load(); }, 250);
    return () => clearTimeout(timer);
  }, [search, status]);

  useEffect(() => { load(); }, [page, sort, dir]);

  useEffect(() => {
    crmApi('/api/crm/companies?pageSize=200').then((d) => setCompanies(d.items || [])).catch(() => {});
  }, []);

  const loadRelated = async (id: string) => {
    setRelatedLoading(true);
    try {
      const [deals, tasks, activities, notes] = await Promise.all([
        crmApi(`/api/crm/deals?crmContactId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/tasks?crmContactId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/activities?crmContactId=${id}&pageSize=50`).catch(() => ({ items: [] })),
        crmApi(`/api/crm/notes?crmContactId=${id}&pageSize=50`).catch(() => ({ items: [] })),
      ]);
      setRelated({ deals: deals.items || [], tasks: tasks.items || [], activities: activities.items || [], notes: notes.items || [] });
    } finally { setRelatedLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({
      firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '',
      position: c.position || '', crmCompanyId: c.crmCompanyId || '', notes: c.notes || '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'الاسم الأول مطلوب';
    if (!form.phone.trim()) e.phone = 'رقم الهاتف مطلوب';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'صيغة البريد الإلكتروني غير صحيحة';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setApiError(null);
    try {
      const payload = { ...form, crmCompanyId: form.crmCompanyId || null };
      if (editing) await crmApi(`/api/crm/contacts/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await crmApi('/api/crm/contacts', { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/contacts/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const toggleSort = (field: string) => {
    if (sort === field) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setDir('asc'); }
  };

  const th = (label: string, field?: string) => (
    <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7177] ${field ? 'cursor-pointer select-none hover:text-[#3e97ff]' : ''}`}
      onClick={field ? () => toggleSort(field) : undefined}>
      {label}{sort === field && <span className="text-[#3e97ff]"> {dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'deals', label: 'الصفقات', count: related.deals.length },
    { key: 'tasks', label: 'المهام', count: related.tasks.length },
    { key: 'activities', label: 'الأنشطة', count: related.activities.length },
    { key: 'notes', label: 'الملاحظات', count: related.notes.length },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a]">جهات الاتصال</h1>
            <p className="text-xs text-[#6b7177] mt-1">إدارة جهات الاتصال والعملاء</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>إضافة جهة اتصال</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  type="text" placeholder="بحث بالاسم، الهاتف، البريد..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#eef0f3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3e97ff]/30 focus:border-[#3e97ff]"
                />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
                <option value="all">كل الحالات</option>
                <option value="ACTIVE">نشط</option>
                <option value="INACTIVE">غير نشط</option>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#eef0f3]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8f9fa]">
                  <tr>
                    {th('الاسم', 'firstName')}
                    {th('الشركة')}
                    {th('الهاتف', 'phone')}
                    {th('البريد الإلكتروني')}
                    {th('المسمى الوظيفي')}
                    {th('الحالة')}
                    {th('تاريخ الإنشاء', 'createdAt')}
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7177]">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0f3] bg-white">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</td></tr>
                  ) : !items.length ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</td></tr>
                  ) : items.map((c) => (
                    <tr key={c.id} className="hover:bg-[#f8f9fa] cursor-pointer transition-colors" onClick={() => { setSelected(c); setTab('info'); loadRelated(c.id); }}>
                      <td className="px-4 py-3 font-semibold text-[#252f4a]">
                        <span className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[#eaf3ff] text-[#3e97ff] flex items-center justify-center text-[10px] font-bold">
                            {(c.firstName || '?').charAt(0)}
                          </span>
                          {c.firstName} {c.lastName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#4b5675]">{c.company?.name || '—'}</td>
                      <td className="px-4 py-3 text-xs font-mono text-[#252f4a]" dir="ltr">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-[#3e97ff]" />{c.phone}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#4b5675]" dir="ltr">
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-[#9ca3af]" />{c.email || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#4b5675]">{c.position || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={c.status === 'ACTIVE' ? 'success' : 'default'}>{c.status === 'ACTIVE' ? 'نشط' : 'غير نشط'}</Badge></td>
                      <td className="px-4 py-3 text-xs text-[#6b7177]">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="تعديل"><Pencil className="w-3.5 h-3.5 text-[#3e97ff]" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} title="حذف"><Trash2 className="w-3.5 h-3.5 text-[#d13b4c]" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      {/* Create / Edit Modal */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل جهة اتصال' : 'إضافة جهة اتصال'} maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs rounded-lg">{apiError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="الاسم الأول *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} error={errors.firstName} />
            <Input label="اسم العائلة" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="رقم الهاتف *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
            <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="الشركة" value={form.crmCompanyId} onChange={(e) => setForm({ ...form, crmCompanyId: e.target.value })}>
              <option value="">— بدون —</option>
              {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </Select>
            <Input label="المسمى الوظيفي" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#4b5675]">
          هل أنت متأكد من حذف جهة الاتصال <span className="font-bold text-[#252f4a]">{deleting?.firstName} {deleting?.lastName}</span>؟ لا يمكن التراجع عن هذا الإجراء.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>

      {/* Details Modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={`${selected?.firstName || ''} ${selected?.lastName || ''}`} subtitle="ملف جهة الاتصال" maxWidth="2xl">
        <div className="flex gap-2 border-b border-[#eef0f3] pb-3 mb-4 overflow-x-auto">
          {tabs.map((tb) => (
            <button
              key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${tab === tb.key ? 'bg-[#3e97ff] text-white' : 'bg-[#f8f9fa] text-[#4b5675] hover:bg-[#eef0f3]'}`}
            >
              {tb.label}{tb.count !== undefined ? ` (${tb.count})` : ''}
            </button>
          ))}
        </div>

        {relatedLoading ? (
          <p className="py-8 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p>
        ) : tab === 'info' && (
          <div className="p-4 bg-[#f8f9fa] rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-[#9ca3af]">الهاتف:</span><p className="font-bold font-mono text-[#252f4a]" dir="ltr">{selected?.phone}</p></div>
            <div><span className="text-[#9ca3af]">البريد:</span><p className="font-bold text-[#252f4a]" dir="ltr">{selected?.email || '—'}</p></div>
            <div><span className="text-[#9ca3af]">الشركة:</span><p className="font-medium text-[#252f4a]">{selected?.company?.name || '—'}</p></div>
            <div><span className="text-[#9ca3af]">المسمى الوظيفي:</span><p className="font-medium text-[#252f4a]">{selected?.position || '—'}</p></div>
            <div className="col-span-2"><span className="text-[#9ca3af]">ملاحظات:</span><p className="font-medium text-[#252f4a]">{selected?.notes || '—'}</p></div>
          </div>
        )}
        {tab === 'deals' && (
          <div className="divide-y divide-[#eef0f3]">
            {related.deals.map((d) => (
              <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#252f4a]">{d.title}</span>
                <span className="flex items-center gap-2">
                  <span className="font-bold text-[#252f4a]">{formatCurrency(d.value, d.currency)}</span>
                  <Badge variant={stageLabels[d.stage]?.variant}>{stageLabels[d.stage]?.ar || d.stage}</Badge>
                </span>
              </div>
            ))}
            {!related.deals.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد صفقات</p>}
          </div>
        )}
        {tab === 'tasks' && (
          <div className="divide-y divide-[#eef0f3]">
            {related.tasks.map((task) => (
              <div key={task.id} className="py-2.5 flex items-center justify-between text-xs">
                <span className="font-medium text-[#252f4a]">{task.title}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={priorityLabels[task.priority]?.variant}>{priorityLabels[task.priority]?.ar || task.priority}</Badge>
                  <Badge variant={taskStatusLabels[task.status]?.variant}>{taskStatusLabels[task.status]?.ar || task.status}</Badge>
                </span>
              </div>
            ))}
            {!related.tasks.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد مهام</p>}
          </div>
        )}
        {tab === 'activities' && (
          <div className="space-y-3">
            {related.activities.map((a) => (
              <div key={a.id} className="p-3 bg-[#f8f9fa] rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={activityTypeLabels[a.type]?.variant}>{activityTypeLabels[a.type]?.ar || a.type}</Badge>
                  <span className="text-[#9ca3af]">{formatDateTime(a.occurredAt)}</span>
                </div>
                <p className="font-semibold text-[#252f4a] mt-1">{a.subject}</p>
                {a.description && <p className="text-[#6b7177] mt-0.5">{a.description}</p>}
              </div>
            ))}
            {!related.activities.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد أنشطة</p>}
          </div>
        )}
        {tab === 'notes' && (
          <div className="space-y-3">
            {related.notes.map((n) => (
              <div key={n.id} className="p-3 bg-[#f8f9fa] rounded-lg text-xs">
                <p className="text-[#252f4a]">{n.body}</p>
                <p className="text-[#9ca3af] mt-1">{n.author?.name || ''} • {formatDateTime(n.createdAt)}</p>
              </div>
            ))}
            {!related.notes.length && <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد ملاحظات</p>}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
