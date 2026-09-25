'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';
import {
  fillTemplate,
  SITUATIONS,
  type FillContext,
  type MessageTemplate,
  type Situation,
} from '@/lib/message-templates';

/**
 * THE SENTENCES SENT TO CUSTOMERS, FILED BY THE MOMENT THEY BELONG TO.
 *
 * They were one flat pile in the order somebody happened to add them, so an
 * agent hunting the right words mid-call read all of them. They are grouped
 * by the MOMENT now — she knows which moment she is in, and never knows
 * which of two channels a sentence was filed under.
 *
 * Two smaller things, both learned from messages that reached customers:
 *
 * The placeholders are BUTTONS. Typed from memory, `{اسم_الزبون}` becomes
 * `{اسم الزبون}` and goes out with a brace in it that the customer can do
 * nothing about. Clicked, it cannot be misspelled.
 *
 * And the preview runs on a REAL order of this store, not an invented one.
 * A made-up order checks the spelling of the placeholders and nothing else:
 * a template reads perfectly against "محمد / SY-2026-0150" and comes out
 * with a hole in it on the orders this shop actually takes, because nobody
 * here fills in a governorate, or the courier is set after the message goes.
 */

interface Loaded {
  templates: MessageTemplate[];
  vars: { key: string; label: string }[];
  languages: { code: string; label: string }[];
  /** The newest real order of this store. Null on a shop with no orders yet. */
  sample: FillContext | null;
}

const INPUT =
  'h-9 px-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]';

/** Nothing to fill from — said plainly rather than previewed against a lie. */
const NO_SAMPLE = 'لا طلبات في هذا المتجر بعد، فلا معاينة بطلب حقيقي.';

export function MessageTemplatesCard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<Situation | null>(null);
  /** The body box last touched — where a clicked placeholder goes. */
  const boxes = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const load = useCallback(async () => {
    try {
      const d = await apiJson<Loaded>('/api/settings/messages?sample=1');
      setData(d);
      setTemplates(d.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) {
    return <p className="rounded-lg border border-[#fecdd1] bg-[#feecee] p-2.5 text-xs text-[#fb323f]">{error}</p>;
  }
  if (!data) return null;

  const patch = (id: string, fields: Partial<MessageTemplate>) =>
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, ...fields } : t)));

  /**
   * Put a placeholder where the cursor is.
   *
   * Appending it to the end would be worse than typing it: the sentence is
   * being written in the middle, and a name that lands after the full stop
   * has to be cut and pasted back anyway.
   */
  const insertVar = (id: string, key: string) => {
    const box = boxes.current[id];
    const token = `{${key}}`;
    const body = templates.find((t) => t.id === id)?.body ?? '';
    if (!box) return patch(id, { body: body + token });
    const at = box.selectionStart ?? body.length;
    const to = box.selectionEnd ?? at;
    patch(id, { body: body.slice(0, at) + token + body.slice(to) });
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(at + token.length, at + token.length);
    });
  };

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

  const add = (situation: Situation) =>
    setTemplates([
      ...templates,
      {
        id: `t-${situation}-${templates.length + 1}-${templates.length}`,
        name: '',
        channel: 'BOTH',
        body: '',
        situation,
        lang: data.languages[0]?.code ?? 'ar',
        active: true,
      },
    ]);

  return (
    <div className="space-y-2" dir="rtl">
      <p className="text-[11px] leading-relaxed text-[#697586]">
        تُرسَل من رقم شركتك عبر تطبيقك — بلا بوابة ولا اشتراك ولا كلفة لكل رسالة. مجمّعة حسب الموقف
        الذي تُقال فيه، لا حسب القناة.
      </p>

      {SITUATIONS.map((s) => {
        const mine = templates.filter((t) => t.situation === s.key);
        const isOpen = openGroup === s.key;
        const live = mine.filter((t) => t.active).length;
        return (
          <section key={s.key} className="rounded-lg border border-[#e3e8ef] bg-white">
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : s.key)}
              className="flex w-full items-center gap-2 px-3 py-2 text-start"
            >
              <span className="flex-1 text-xs font-semibold text-[#364152]">{s.ar}</span>
              <span className="text-[10px] tabular-nums text-[#9aa4b2]">
                {mine.length === 0 ? 'لا قوالب' : `${live} من ${mine.length} مفعّلة`}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-[#9aa4b2] transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="space-y-2 border-t border-[#f1f3f6] p-2.5">
                {mine.map((t) => (
                  <div
                    key={t.id}
                    className={`space-y-2 rounded-lg border p-2.5 ${
                      t.active ? 'border-[#e3e8ef]' : 'border-dashed border-[#e3e8ef] bg-[#fafbfc]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={t.name}
                        onChange={(e) => patch(t.id, { name: e.target.value })}
                        placeholder="اسم القالب"
                        className={`${INPUT} min-w-[8rem] flex-1 font-semibold`}
                      />
                      <select
                        value={t.situation}
                        onChange={(e) => patch(t.id, { situation: e.target.value as Situation })}
                        className={`${INPUT} w-28`}
                        aria-label="الموقف"
                      >
                        {SITUATIONS.map((x) => (
                          <option key={x.key} value={x.key}>{x.ar}</option>
                        ))}
                      </select>
                      <select
                        value={t.channel}
                        onChange={(e) => patch(t.id, { channel: e.target.value as MessageTemplate['channel'] })}
                        className={`${INPUT} w-24`}
                        aria-label="القناة"
                      >
                        <option value="BOTH">الاثنتان</option>
                        <option value="SMS">SMS</option>
                        <option value="WHATSAPP">واتساب</option>
                      </select>
                      <select
                        value={t.lang}
                        onChange={(e) => patch(t.id, { lang: e.target.value })}
                        className={`${INPUT} w-24`}
                        aria-label="اللغة"
                      >
                        {data.languages.map((l) => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-[10px] text-[#697586]">
                        <input
                          type="checkbox"
                          checked={t.active}
                          onChange={(e) => patch(t.id, { active: e.target.checked })}
                          className="accent-[#b8256e]"
                        />
                        مفعّل
                      </label>
                      <button
                        type="button"
                        onClick={() => setTemplates(templates.filter((x) => x.id !== t.id))}
                        aria-label="احذف القالب"
                        className="rounded-lg p-1.5 text-[#9aa4b2] hover:bg-[#feecee] hover:text-[#fb323f]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <textarea
                      ref={(el) => {
                        boxes.current[t.id] = el;
                      }}
                      value={t.body}
                      onChange={(e) => patch(t.id, { body: e.target.value })}
                      rows={2}
                      maxLength={1000}
                      className="w-full rounded-lg border border-[#e3e8ef] bg-white px-2 py-2 text-xs text-[#364152] outline-none focus:border-[#b8256e]"
                    />

                    {/* Clicked, never typed: a hand-written placeholder with a
                        space in it reaches the customer as a brace. */}
                    <div className="flex flex-wrap gap-1">
                      {data.vars.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          title={v.label}
                          onClick={() => insertVar(t.id, v.key)}
                          className="rounded border border-[#e3e8ef] bg-[#f8fafc] px-1.5 py-0.5 text-[10px] text-[#b8256e] hover:border-[#b8256e]"
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>

                    <p className="rounded bg-[#f8fafc] px-2 py-1.5 text-[10px] leading-relaxed text-[#697586]">
                      {data.sample ? fillTemplate(t.body, data.sample) || '—' : NO_SAMPLE}
                    </p>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={() => add(s.key)}>
                  <Plus className="h-3.5 w-3.5" />
                  قالب في «{s.ar}»
                </Button>
              </div>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
          احفظ القوالب
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#00a344]">
            <Check className="h-3.5 w-3.5" /> تم الحفظ
          </span>
        )}
        {data.sample && (
          <span className="text-[10px] text-[#9aa4b2]">
            المعاينة بالطلب{' '}
            <span dir="ltr" className="tabular-nums">{data.sample.orderNumber}</span>
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-[#fecdd1] bg-[#feecee] p-2.5 text-xs text-[#fb323f]">{error}</p>
      )}
    </div>
  );
}
