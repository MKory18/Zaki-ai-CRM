'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Search, Plus, Pencil, Trash2, StickyNote } from 'lucide-react';
import { crmApi, qs } from '@/lib/crm-client';
import { formatDateTime } from '@/lib/crm-format';

const emptyForm = { body: '', crmContactId: '', crmCompanyId: '', crmDealId: '', crmLeadId: '' };

export default function NotesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi(`/api/crm/notes${qs({ q: search, page, pageSize: 12 })}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load(); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { load(); }, [page]);

  useEffect(() => {
    crmApi('/api/crm/contacts?pageSize=200').then((d) => setContacts(d.items || [])).catch(() => {});
    crmApi('/api/crm/companies?pageSize=200').then((d) => setCompanies(d.items || [])).catch(() => {});
    crmApi('/api/crm/deals?pageSize=200').then((d) => setDeals(d.items || [])).catch(() => {});
    crmApi('/api/crm/leads?pageSize=200').then((d) => setLeads(d.items || [])).catch(() => {});
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setErrors({}); setApiError(null); setFormOpen(true); };
  const openEdit = (n: any) => {
    setEditing(n);
    setForm({
      body: n.body || '', crmContactId: n.crmContactId || '', crmCompanyId: n.crmCompanyId || '',
      crmDealId: n.crmDealId || '', crmLeadId: n.crmLeadId || '',
    });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!form.body.trim()) e.body = 'نص الملاحظة مطلوب';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true); setApiError(null);
    try {
      const payload = {
        body: form.body,
        crmContactId: form.crmContactId || null,
        crmCompanyId: form.crmCompanyId || null,
        crmDealId: form.crmDealId || null,
        crmLeadId: form.crmLeadId || null,
      };
      if (editing) await crmApi(`/api/crm/notes/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await crmApi('/api/crm/notes', { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/crm/notes/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err: any) { setApiError(err.message); setDeleting(null); }
    finally { setDeleteLoading(false); }
  };

  const relatedLabel = (n: any) => {
    if (n.crmContact) return { label: `${n.crmContact.firstName} ${n.crmContact.lastName}`, href: '/dashboards/crm/contacts' as const };
    if (n.company || n.crmCompany) return { label: n.company?.name || n.crmCompany?.name, href: undefined };
    if (n.crmDeal) return { label: n.crmDeal.title, href: undefined };
    if (n.crmLead) return { label: `${n.crmLead.firstName} ${n.crmLead.lastName}`, href: undefined };
    return null;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">الملاحظات</h1>
            <p className="text-xs text-[#697586] mt-1">ملاحظات مرتبطة بجهات الاتصال والصفقات</p>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>إضافة ملاحظة</span>
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <input type="text" placeholder="بحث في الملاحظات..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e] shadow-[0_1px_3px_rgba(0,0,0,0.1)]" />
        </div>

        {loading ? (
          <p className="py-12 text-center text-xs text-[#9ca3af]">جارٍ التحميل...</p>
        ) : !items.length ? (
          <p className="py-12 text-center text-xs text-[#9ca3af]">لا توجد ملاحظات</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((n) => {
              const rel = relatedLabel(n);
              return (
                <div key={n.id} className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="p-2 rounded-lg bg-[#fff6e5] text-[#ffab00]"><StickyNote className="w-4 h-4" /></span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(n)}><Pencil className="w-3.5 h-3.5 text-[#b8256e]" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(n)}><Trash2 className="w-3.5 h-3.5 text-[#fb323f]" /></Button>
                    </div>
                  </div>
                  <p className="text-sm text-[#121926] whitespace-pre-wrap line-clamp-4">{n.body}</p>
                  <div className="pt-2 border-t border-[#e3e8ef] flex items-center justify-between text-[11px]">
                    <span className="text-[#9ca3af]">{n.author?.name || ''} • {formatDateTime(n.createdAt)}</span>
                    {rel && (
                      <a href={rel.href} className="font-semibold text-[#b8256e] hover:underline">→ {rel.label}</a>
                    )}
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
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل ملاحظة' : 'إضافة ملاحظة'} maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {apiError && <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg">{apiError}</div>}
          <Textarea label="نص الملاحظة *" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} error={errors.body} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="جهة الاتصال" value={form.crmContactId} onChange={(e) => setForm({ ...form, crmContactId: e.target.value })}>
              <option value="">— بدون —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </Select>
            <Select label="الشركة" value={form.crmCompanyId} onChange={(e) => setForm({ ...form, crmCompanyId: e.target.value })}>
              <option value="">— بدون —</option>
              {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
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
        <p className="text-sm text-[#364152]">هل أنت متأكد من حذف هذه الملاحظة؟ لا يمكن التراجع.</p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>حذف</Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
