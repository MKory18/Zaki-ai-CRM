'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';
import { fillTemplate, type MessageTemplate } from '@/lib/message-templates';

/**
 * THE SENTENCES SENT TO CUSTOMERS.
 *
 * Written once here, chosen in two clicks on the tracking screen. The
 * alternative is an agent typing the same message forty times a day, which
 * is exactly where a wrong order number comes from.
 *
 * Every template previews itself against a sample order, because a
 * placeholder nobody noticed was misspelled reaches a real customer as a
 * brace they cannot act on.
 */

const SAMPLE = {
  orderNumber: 'SY-2026-0150',
  customerName: 'محمد',
  amount: 50,
  currency: 'USD',
  courier: 'باشا',
  barcode: 'BC-777',
  region: 'السويداء',
  storeName: 'متجرك',
};

const INPUT =
  'w-full h-9 px-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]';

export function MessageTemplatesCard() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [vars, setVars] = useState<{ key: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ templates: MessageTemplate[]; vars: { key: string; label: string }[] }>(
        '/api/settings/messages'
      );
      setTemplates(d.templates ?? []);
      setVars(d.vars ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!templates) return null;

  const patch = (i: number, fields: Partial<MessageTemplate>) =>
    setTemplates(templates.map((t, n) => (n === i ? { ...t, ...fields } : t)));

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const d = await apiJson<{ templates: MessageTemplate[] }>('/api/settings/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });
      setTemplates(d.templates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="رسائل جاهزة للزبائن"
        subtitle="تُرسَل من رقم شركتك عبر تطبيقك — بلا بوابة ولا اشتراك ولا كلفة لكل رسالة"
      />
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1 text-[10px]">
          <span className="text-[#697586]">اكتب بين قوسين:</span>
          {vars.map((v) => (
            <code
              key={v.key}
              title={v.label}
              className="px-1.5 py-0.5 rounded bg-[#f8fafc] border border-[#e3e8ef] text-[#b8256e] cursor-help"
              dir="rtl"
            >
              {`{${v.key}}`}
            </code>
          ))}
        </div>

        {templates.map((t, i) => (
          <div key={i} className="rounded-lg border border-[#e3e8ef] p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={t.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                placeholder="اسم الرسالة"
                className={`${INPUT} flex-1 min-w-[8rem] font-semibold`}
              />
              <select
                value={t.channel}
                onChange={(e) => patch(i, { channel: e.target.value as MessageTemplate['channel'] })}
                className={`${INPUT} w-28`}
              >
                <option value="BOTH">الاثنتان</option>
                <option value="SMS">SMS فقط</option>
                <option value="WHATSAPP">واتساب فقط</option>
              </select>
              <button
                type="button"
                onClick={() => setTemplates(templates.filter((_, n) => n !== i))}
                aria-label="احذف الرسالة"
                className="p-1.5 rounded-lg text-[#9aa4b2] hover:text-[#fb323f] hover:bg-[#feecee]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={t.body}
              onChange={(e) => patch(i, { body: e.target.value })}
              rows={2}
              maxLength={1000}
              className="w-full px-2 py-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]"
            />
            {/* What the customer will actually read — the only useful check. */}
            <p className="text-[10px] text-[#697586] bg-[#f8fafc] rounded px-2 py-1.5">
              {fillTemplate(t.body, SAMPLE) || '—'}
            </p>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setTemplates([
                ...templates,
                { id: `t-${Date.now()}`, name: '', channel: 'BOTH', body: '' },
              ])
            }
          >
            <Plus className="w-3.5 h-3.5" />
            رسالة
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            احفظ
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#00a344]">
              <Check className="w-3.5 h-3.5" /> تم الحفظ
            </span>
          )}
        </div>

        {error && (
          <p className="text-xs text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-lg p-2.5">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
