'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Power, FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm, useTell } from '@/components/ui/Confirm';
import { screenApi as crmApi } from '@/lib/screen-api';

/**
 * WHICH TELEGRAM GROUPS AND TOPICS BECOME ORDERS — configuration, on the
 * settings screen.
 *
 * The groups used to be added, switched and removed from the Telegram
 * ORDERS screen, while the settings screen for the same integration showed
 * only the bot's status. Configuration belongs with configuration; the
 * orders screen keeps the messages and what became of them.
 */

interface TelegramSource {
  id: string;
  chatId: string;
  chatType: string;
  chatTitle: string | null;
  topicId: number | null;
  topicName: string | null;
  isActive: boolean;
  ordersCount: number;
  lastMessageAt: string | null;
  storeName: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المعالجة',
  PROCESSED: 'تم إنشاء طلب',
  IGNORED: 'تم التجاهل',
  NEEDS_REVIEW: 'قيد المراجعة',
  FAILED: 'فشل',
};

export function TelegramSourcesCard({ canManage }: { canManage: boolean }) {
  const ask = useConfirm();
  const tell = useTell();
  const [sources, setSources] = useState<TelegramSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ chatId: '', chatTitle: '', topicId: '', topicName: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const src = await crmApi('/api/telegram/sources');
      setSources(src.sources || []);
      setError(null);
    } catch (e: any) {
      setSources([]);
      setError(e?.message || 'تعذر تحميل المصادر');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addSource = async () => {
    setFormError(null);
    setSaving(true);
    try {
      await crmApi('/api/telegram/sources', {
        method: 'POST',
        body: JSON.stringify({
          chatId: form.chatId.trim(),
          chatType: 'supergroup',
          chatTitle: form.chatTitle.trim() || null,
          topicId: form.topicId.trim() ? Number(form.topicId.trim()) : null,
          topicName: form.topicName.trim() || null,
          isActive: true,
        }),
      });
      setAddOpen(false);
      setForm({ chatId: '', chatTitle: '', topicId: '', topicName: '' });
      await load();
    } catch (e: any) {
      setFormError(e?.message || 'تعذر إضافة المصدر');
    } finally {
      setSaving(false);
    }
  };

  const act = async (s: TelegramSource, run: () => Promise<unknown>, failure: string) => {
    setBusyId(s.id);
    try {
      await run();
      await load();
    } catch (e: any) {
      setError(e?.message || failure);
    } finally {
      setBusyId(null);
    }
  };

  const deleteSource = async (s: TelegramSource) => {
    const ok = await ask({
      title: `حذف الربط مع «${s.chatTitle || s.chatId}»؟`,
      body: 'الطلبات السابقة تبقى كما هي.',
      tone: 'danger',
    });
    if (!ok) return;
    await act(s, () => crmApi(`/api/telegram/sources/${s.id}`, { method: 'DELETE' }), 'تعذر الحذف');
  };

  const testSource = (s: TelegramSource) =>
    act(s, async () => {
      const r: any = await crmApi(`/api/telegram/sources/${s.id}/test`, { method: 'POST' });
      void tell({
        title: 'نتيجة اختبار المجموعة',
        body: r.lastMessage
          ? `آخر رسالة: ${new Date(r.lastMessage.createdAt).toLocaleString('ar')} — الحالة: ${STATUS_LABELS[r.lastMessage.processingStatus] || r.lastMessage.processingStatus}`
          : 'لا توجد رسائل مستلمة من هذه المجموعة بعد',
      });
    }, 'تعذر الاختبار');

  return (
    <Card>
      <CardHeader
        title="المجموعات والمواضيع المرتبطة"
        subtitle="كل رسالة طلب في مجموعة أو موضوع مرتبط تصير طلباً في متجره. المصدر الجديد يُربط بالمتجر المختار من الأعلى."
      />
      <CardContent className="p-0">
        {canManage && (
          <div className="flex justify-end px-4 pb-2">
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="ml-1 h-4 w-4" /> إضافة مصدر</Button>
          </div>
        )}
        {error && <p className="mx-4 mb-2 rounded-lg bg-[var(--sys-destructive-soft)] px-3 py-2 text-xs text-[var(--sys-destructive)]">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-[var(--sys-border)] bg-[var(--sys-surface)] font-semibold text-[var(--sys-muted-foreground)]">
              <tr>
                <th className="px-4 py-3 text-right">المجموعة</th>
                <th className="px-4 py-3 text-right">المتجر</th>
                <th className="px-4 py-3 text-right">النوع</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-right">الطلبات</th>
                <th className="px-4 py-3 text-right">آخر رسالة</th>
                {canManage && <th className="px-4 py-3 text-left">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {sources === null ? (
                <tr><td colSpan={7} className="py-8 text-center text-[var(--sys-muted)]">جارٍ التحميل...</td></tr>
              ) : sources.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-[var(--sys-muted)]">لا مجموعات مرتبطة بعد.</td></tr>
              ) : sources.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--sys-surface)]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--sys-heading)]">{s.chatTitle || 'بدون عنوان'}</p>
                    <p className="font-mono text-caption text-[var(--sys-muted-foreground)]" dir="ltr">{s.chatId}{s.topicId ? ` • topic ${s.topicId}` : ''}</p>
                    {s.topicName && <p className="text-caption text-[var(--sys-muted-foreground)]">الموضوع: {s.topicName}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--sys-foreground)]">{s.storeName ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--sys-muted-foreground)]">{s.chatType === 'supergroup' ? 'مجموعة فائقة' : s.chatType === 'group' ? 'مجموعة' : 'قناة'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${s.isActive ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]'}`}>
                      {s.isActive ? 'مفعل' : 'معطل'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--sys-heading)]">{s.ordersCount}</td>
                  <td className="px-4 py-3 text-[var(--sys-muted-foreground)]">{s.lastMessageAt ? new Date(s.lastMessageAt).toLocaleString('ar') : '—'}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button disabled={busyId === s.id} onClick={() => void testSource(s)} title="اختبار" className="rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)]"><FlaskConical className="h-4 w-4" /></button>
                        <button
                          disabled={busyId === s.id}
                          onClick={() => void act(s, () => crmApi(`/api/telegram/sources/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) }), 'تعذر التحديث')}
                          title={s.isActive ? 'تعطيل' : 'تفعيل'}
                          className="rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)]"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button disabled={busyId === s.id} onClick={() => void deleteSource(s)} title="حذف" className="rounded-lg p-1.5 text-rose-500 hover:bg-[var(--sys-destructive-soft)]"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="إضافة مصدر تيليجرام">
        <div className="space-y-4" dir="rtl">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--sys-heading)]">Chat ID *</label>
            <Input value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="-1001234567890" dir="ltr" className="text-left font-mono" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--sys-heading)]">اسم المجموعة</label>
            <Input value={form.chatTitle} onChange={(e) => setForm({ ...form, chatTitle: e.target.value })} placeholder="مجموعة طلبات المتجر" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--sys-heading)]">Topic ID (اختياري)</label>
              <Input value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })} placeholder="فارغ = المجموعة كاملة" dir="ltr" className="text-left font-mono" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--sys-heading)]">اسم الموضوع</label>
              <Input value={form.topicName} onChange={(e) => setForm({ ...form, topicName: e.target.value })} />
            </div>
          </div>
          {formError && <p className="text-xs text-[var(--sys-destructive)]">{formError}</p>}
          <p className="text-caption leading-relaxed text-[var(--sys-muted-foreground)]">
            تأكد من إضافة البوت إلى المجموعة ومن تفعيل Privacy Mode المناسب. اترك Topic ID فارغًا لربط المجموعة بالكامل.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button size="sm" disabled={!form.chatId.trim() || saving} onClick={() => void addSource()}>{saving ? 'جارٍ الحفظ...' : 'إضافة'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
