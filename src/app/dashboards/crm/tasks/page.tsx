'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Plus, Pencil, Trash2, CheckCircle2, ChevronRight, ChevronLeft, Search, AlertTriangle, Clock } from 'lucide-react';
import { crmApi, qs, fetchAssignableUsers } from '@/lib/crm-client';
import { formatDateTime, taskStatusLabels, priorityLabels, isOverdue } from '@/lib/crm-format';

const emptyForm = { title: '', description: '', status: 'TODO', priority: 'MEDIUM', dueDate: '', assignedToId: '', crmContactId: '', crmDealId: '' };

export default function TasksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
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

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/tasks${qs({ q: search, status, priority, page, pageSize: 12 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load(); }, 250);
    return () => clearTimeout(timer);
  }, [search, status, priority]);
  useEffect(() => { load(); }, [page]);

  useEffect(() => {
    fetchAssignableUsers().then(setUsers).catch(() => {});
    crmApi('/api/crm/contacts?pageSize=200').then((d) => setContacts(d.items || [])).catch(() => {});
    crmApi('/api/crm/deals?pageSize=200').then((d) => setDeals(d.items || [])).catch(() => {});
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };
  const openEdit = (task: any) => {
    setEditing(task);
    setForm({
      title: task.title || '', description: task.description || '', status: task.status || 'TODO',
      priority: task.priority || 'MEDIUM', dueDate: task.dueDate ? task.dueDate.slice(0, 16) : '',
      assignedToId: task.assignedToId || '', crmContactId: task.crmContactId || '', crmDealId: task.crmDealId || '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'عنوان المهمة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true); setApiError(null);
    try {
      const payload: any = {
        title: form.title, description: form.description, status: form.status, priority: form.priority,
        dueDate: form.dueDate || null,
        assignedToId: form.assignedToId || null,
        crmContactId: form.crmContactId || null,
        crmDealId: form.crmDealId || null,
      };
      if (editing) await crmApi(`/api/crm/tasks/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await crmApi('/api/crm/tasks', { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/tasks/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const quickToggle = async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try {
      await crmApi(`/api/crm/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    } catch {
      load();
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">المهام</h1>
            <p className="text-xs text-[#697586] mt-1">متابعة المهام والمواعيد النهائية</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>إضافة مهمة</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input type="text" placeholder="بحث بعنوان المهمة..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]" />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
                <option value="all">كل الحالات</option>
                {Object.entries(taskStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-[180px]">
                <option value="all">كل الأولويات</option>
                {Object.entries(priorityLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </Select>
            </div>

            <div className="divide-y divide-[#e3e8ef] rounded-lg border border-[#e3e8ef] bg-white">
              {loading ? (
                <p className="py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p>
              ) : !items.length ? (
                <p className="py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</p>
              ) : items.map((task) => {
                const overdue = task.status !== 'DONE' && task.status !== 'CANCELLED' && isOverdue(task.dueDate);
                return (
                  <div key={task.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f8fafc] cursor-pointer transition-colors" onClick={() => setSelected(task)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); quickToggle(task); }}
                        title={task.status === 'DONE' ? 'إعادة فتح' : 'إنجاز'}
                        className={`shrink-0 cursor-pointer transition-colors ${task.status === 'DONE' ? 'text-[#00c853]' : 'text-[#c9cdd4] hover:text-[#00c853]'}`}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${task.status === 'DONE' ? 'text-[#9ca3af] line-through' : 'text-[#121926]'}`}>{task.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-[#fb323f] font-bold' : 'text-[#697586]'}`}>
                            {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {formatDateTime(task.dueDate)}
                            {overdue && ' (متأخرة)'}
                          </span>
                          {task.crmContact && <span className="text-[11px] text-[#b8256e]">{task.crmContact.firstName} {task.crmContact.lastName}</span>}
                          {task.crmDeal && <span className="text-[11px] text-[#8c72f7]">{task.crmDeal.title}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[#364152] hidden sm:block">{task.assignedTo?.name || '—'}</span>
                      <Badge variant={priorityLabels[task.priority]?.variant || 'default'}>{priorityLabels[task.priority]?.ar || task.priority}</Badge>
                      <Badge variant={taskStatusLabels[task.status]?.variant || 'default'}>{taskStatusLabels[task.status]?.ar || task.status}</Badge>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(task)}><Pencil className="w-3.5 h-3.5 text-[#b8256e]" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(task)}><Trash2 className="w-3.5 h-3.5 text-[#fb323f]" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
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

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل مهمة' : 'إضافة مهمة'} maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{apiError}</div>}
          <Input label="عنوان المهمة *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
          <Textarea label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <Select label="الحالة" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(taskStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Select label="الأولوية" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(priorityLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>
            <Input label="تاريخ الاستحقاق" type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="المسؤول" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
              <option value="">— بدون —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select label="جهة الاتصال" value={form.crmContactId} onChange={(e) => setForm({ ...form, crmContactId: e.target.value })}>
              <option value="">— بدون —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </Select>
            <Select label="الصفقة" value={form.crmDealId} onChange={(e) => setForm({ ...form, crmDealId: e.target.value })}>
              <option value="">— بدون —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#364152]">هل أنت متأكد من حذف المهمة <span className="font-bold text-[#121926]">{deleting?.title}</span>؟</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} subtitle="تفاصيل المهمة" maxWidth="md">
        <div className="p-4 bg-[#f8fafc] rounded-xl grid grid-cols-2 gap-3 text-xs">
          <div><span className="text-[#9ca3af]">الحالة:</span><p className="font-medium text-[#121926]">{taskStatusLabels[selected?.status]?.ar || selected?.status}</p></div>
          <div><span className="text-[#9ca3af]">الأولوية:</span><p className="font-medium text-[#121926]">{priorityLabels[selected?.priority]?.ar || selected?.priority}</p></div>
          <div><span className="text-[#9ca3af]">الاستحقاق:</span><p className="font-medium text-[#121926]">{formatDateTime(selected?.dueDate)}</p></div>
          <div><span className="text-[#9ca3af]">المسؤول:</span><p className="font-medium text-[#121926]">{selected?.assignedTo?.name || '—'}</p></div>
          {selected?.crmContact && <div><span className="text-[#9ca3af]">جهة الاتصال:</span><p className="font-medium text-[#121926]">{selected.crmContact.firstName} {selected.crmContact.lastName}</p></div>}
          {selected?.crmDeal && <div><span className="text-[#9ca3af]">الصفقة:</span><p className="font-medium text-[#121926]">{selected.crmDeal.title}</p></div>}
          <div className="col-span-2"><span className="text-[#9ca3af]">الوصف:</span><p className="font-medium text-[#121926]">{selected?.description || '—'}</p></div>
        </div>
      </Modal>
    </AppLayout>
  );
}
