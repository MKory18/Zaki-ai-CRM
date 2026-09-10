'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Plus, Trash2, Phone, Mail, CalendarDays, StickyNote, RefreshCw, TrendingUp } from 'lucide-react';
import { crmApi, qs } from '@/lib/crm-client';
import { formatDateTime, activityTypeLabels } from '@/lib/crm-format';

const typeIcons: Record<string, any> = {
  CALL: Phone, EMAIL: Mail, MEETING: CalendarDays, NOTE: StickyNote,
  STATUS_CHANGE: RefreshCw, DEAL_STAGE: TrendingUp,
};

const emptyForm = { type: 'CALL', subject: '', description: '', crmContactId: '', crmDealId: '', crmLeadId: '' };

export default function ActivitiesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(true);

  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/activities${qs({ type, page, pageSize: 20 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); }, [type]);
  useEffect(() => { load(); }, [type, page]);

  useEffect(() => {
    crmApi('/api/crm/contacts?pageSize=200').then((d) => setContacts(d.items || [])).catch(() => {});
    crmApi('/api/crm/deals?pageSize=200').then((d) => setDeals(d.items || [])).catch(() => {});
    crmApi('/api/crm/leads?pageSize=200').then((d) => setLeads(d.items || [])).catch(() => {});
  }, []);

  const openCreate = () => { setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!form.subject.trim()) e.subject = 'موضوع النشاط مطلوب';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true); setApiError(null);
    try {
      await crmApi('/api/crm/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type, subject: form.subject, description: form.description,
          crmContactId: form.crmContactId || null,
          crmDealId: form.crmDealId || null,
          crmLeadId: form.crmLeadId || null,
        }),
      });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/activities/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const relatedLabel = (a: any) => {
    if (a.crmContact) return `${a.crmContact.firstName} ${a.crmContact.lastName}`;
    if (a.crmDeal) return a.crmDeal.title;
    if (a.crmLead) return `${a.crmLead.firstName} ${a.crmLead.lastName}`;
    return null;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">الأنشطة</h1>
            <p className="text-xs text-[#697586] mt-1">سجل المكالمات، البريد، الاجتماعات والملاحظات</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>تسجيل نشاط</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <Select value={type} onChange={(e) => setType(e.target.value)} className="max-w-[200px]">
              <option value="all">كل الأنواع</option>
              {Object.entries(activityTypeLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </Select>

            {loading ? (
              <p className="py-10 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p>
            ) : !items.length ? (
              <p className="py-10 text-center text-xs text-[#9ca3af]">لا توجد نتائج</p>
            ) : (
              <div className="space-y-3 border-r border-[#e3e8ef] pr-5">
                {items.map((a) => {
                  const Icon = typeIcons[a.type] || StickyNote;
                  return (
                    <div key={a.id} className="relative">
                      <span className="absolute -right-[27px] top-3 w-2.5 h-2.5 rounded-full bg-[#b8256e] ring-4 ring-[#f8fafc]" />
                      <div className="p-4 bg-[#f8fafc] rounded-[8px] flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={activityTypeLabels[a.type]?.variant || 'default'}>
                              <Icon className="w-3 h-3 ml-1 rtl:ml-0 rtl:mr-1" />
                              {activityTypeLabels[a.type]?.ar || a.type}
                            </Badge>
                            <span className="text-[11px] text-[#9ca3af]">{formatDateTime(a.occurredAt)}</span>
                            {relatedLabel(a) && <span className="text-[11px] font-semibold text-[#b8256e]">→ {relatedLabel(a)}</span>}
                            {a.user?.name && <span className="text-[11px] text-[#9ca3af]">بواسطة {a.user.name}</span>}
                          </div>
                          <p className="text-sm font-semibold text-[#121926] mt-1.5">{a.subject}</p>
                          {a.description && <p className="text-xs text-[#697586] mt-0.5">{a.description}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(a)} className="shrink-0">
                          <Trash2 className="w-3.5 h-3.5 text-[#fb323f]" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-[#697586]">
              <span>الإجمالي: {total}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
                <span>صفحة {page} من {pages}</span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="تسجيل نشاط جديد" maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{apiError}</div>}
          <Select label="نوع النشاط" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(activityTypeLabels).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
          </Select>
          <Input label="الموضوع *" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} error={errors.subject} />
          <Textarea label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <Select label="جهة الاتصال" value={form.crmContactId} onChange={(e) => setForm({ ...form, crmContactId: e.target.value })}>
              <option value="">— بدون —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </Select>
            <Select label="الصفقة" value={form.crmDealId} onChange={(e) => setForm({ ...form, crmDealId: e.target.value })}>
              <option value="">— بدون —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </Select>
            <Select label="العميل المحتمل" value={form.crmLeadId} onChange={(e) => setForm({ ...form, crmLeadId: e.target.value })}>
              <option value="">— بدون —</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#364152]">هل أنت متأكد من حذف النشاط <span className="font-bold text-[#121926]">{deleting?.subject}</span>؟</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
