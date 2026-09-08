'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Plus, RefreshCw } from 'lucide-react';
import { crmApi, fetchAssignableUsers } from '@/lib/crm-client';
import { formatCurrency, stageLabels, DEAL_STAGES, currencyOptions } from '@/lib/crm-format';

const stageColors: Record<string, string> = {
  NEW: 'bg-[#02a0e4]',
  QUALIFIED: 'bg-[#7c5cd6]',
  PROPOSAL: 'bg-[#e49e3d]',
  NEGOTIATION: 'bg-[#3e97ff]',
  WON: 'bg-[#25b865]',
  LOST: 'bg-[#d13b4c]',
};

export default function PipelinePage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<any>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [preStage, setPreStage] = useState('NEW');
  const [form, setForm] = useState<any>({ title: '', value: '', currency: 'USD', stage: 'NEW', probability: 50, crmContactId: '', assignedToId: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi('/api/crm/deals?pageSize=500');
      setDeals(data.items || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    crmApi('/api/crm/contacts?pageSize=200').then((d) => setContacts(d.items || [])).catch(() => {});
    fetchAssignableUsers().then(setUsers).catch(() => {});
  }, []);

  const openCreate = (stage: string) => {
    setPreStage(stage);
    setForm({ title: '', value: '', currency: 'USD', stage, probability: 50, crmContactId: '', assignedToId: '', notes: '' });
    setErrors({}); setApiError(null); setFormOpen(true);
  };

  const handleCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'عنوان الصفقة مطلوب';
    const v = Number(form.value);
    if (!form.value || isNaN(v) || v <= 0) e.value = 'القيمة يجب أن تكون رقماً موجباً';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true); setApiError(null);
    try {
      await crmApi('/api/crm/deals', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title, value: Number(form.value), currency: form.currency, stage: form.stage,
          probability: Number(form.probability), crmContactId: form.crmContactId || null,
          assignedToId: form.assignedToId || null, notes: form.notes,
        }),
      });
      setFormOpen(false);
      load();
    } catch (err: any) { setApiError(err.message); }
    finally { setSaving(false); }
  };

  const handleDrop = async (stage: string) => {
    setDragOverStage(null);
    if (!dragging || dragging.stage === stage) { setDragging(null); return; }
    const deal = dragging;
    const stageDeals = deals.filter((d) => d.stage === stage);
    const position = stageDeals.length;
    // optimistic update
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage, position } : d)));
    setDragging(null);
    try {
      await crmApi(`/api/crm/deals/${deal.id}`, { method: 'PATCH', body: JSON.stringify({ stage, position }) });
    } catch {
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...deal } : d)));
    }
  };

  const byStage = (stage: string) => deals.filter((d) => d.stage === stage);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a]">خط الصفقات</h1>
            <p className="text-xs text-[#6b7177] mt-1">اسحب الصفقات بين المراحل لتحديثها</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} className="flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {DEAL_STAGES.map((stage) => {
            const stageDeals = byStage(stage);
            const totalValue = stageDeals.reduce((s, d) => s + Number(d.value || 0), 0);
            return (
              <div
                key={stage}
                className={`min-w-[280px] w-[280px] shrink-0 rounded-[10px] border transition-colors ${dragOverStage === stage ? 'border-[#3e97ff] bg-[#eaf3ff]/50' : 'border-[#eef0f3] bg-[#f8f9fa]'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={() => handleDrop(stage)}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0f3]">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stageColors[stage]}`} />
                    <span className="text-sm font-semibold text-[#252f4a]">{stageLabels[stage].ar}</span>
                    <span className="text-xs text-[#9ca3af]">({stageDeals.length})</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openCreate(stage)} title="إضافة صفقة">
                    <Plus className="w-4 h-4 text-[#3e97ff]" />
                  </Button>
                </div>
                <p className="px-4 py-2 text-xs font-bold text-[#4b5675]">{formatCurrency(totalValue)}</p>

                <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                  {stageDeals.map((d) => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={() => setDragging(d)}
                      onDragEnd={() => { setDragging(null); setDragOverStage(null); }}
                      className={`bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-3 cursor-grab active:cursor-grabbing transition-opacity ${dragging?.id === d.id ? 'opacity-40' : 'hover:shadow-md'}`}
                    >
                      <p className="text-sm font-semibold text-[#252f4a] truncate">{d.title}</p>
                      <p className="text-xs text-[#6b7177] mt-0.5">
                        {d.crmContact ? `${d.crmContact.firstName} ${d.crmContact.lastName}` : '—'}
                      </p>
                      <p className="text-sm font-bold text-[#252f4a] mt-2">{formatCurrency(d.value, d.currency)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-[#eef0f3] rounded-full overflow-hidden">
                          <div className="h-full bg-[#3e97ff] rounded-full" style={{ width: `${d.probability ?? 0}%` }} />
                        </div>
                        <span className="text-[10px] text-[#9ca3af] font-bold">{d.probability ?? 0}%</span>
                      </div>
                    </div>
                  ))}
                  {!stageDeals.length && (
                    <p className="py-8 text-center text-[11px] text-[#9ca3af]">لا توجد صفقات</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={`صفقة جديدة — ${stageLabels[preStage].ar}`} maxWidth="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {apiError && <div className="p-3 bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs rounded-lg">{apiError}</div>}
          <Input label="عنوان الصفقة *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="القيمة *" type="number" min={0} step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} error={errors.value} />
            <Select label="العملة" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#252f4a] mb-1.5">الاحتمالية: {form.probability}%</label>
            <input type="range" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className="w-full accent-[#3e97ff] cursor-pointer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="جهة الاتصال" value={form.crmContactId} onChange={(e) => setForm({ ...form, crmContactId: e.target.value })}>
              <option value="">— بدون —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
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
    </AppLayout>
  );
}
