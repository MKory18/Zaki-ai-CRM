'use client';

import React, { useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import {
  ASSISTANTS, AI_SCOPES, SCOPE_LABEL_AR, SCOPE_NOTE_AR, type AiScope,
} from '@/lib/ai-assistants';

/**
 * EVERY ASSISTANT, AND WHAT IT IS ALLOWED TO SEE.
 *
 * One assistant answered everything and was handed the whole business, so
 * there was nothing to show here: no list, no scope, no way for the owner
 * to know that the person confirming orders could ask what the company
 * earned.
 *
 * Each row says who it is for, what it may read, and what it may never do.
 * The scopes are not decoration — the service refuses to fetch a fact
 * outside them, so a row that says "no customer data" is a promise the
 * code keeps rather than a label on a prompt.
 *
 * Only the business-intelligence assistant has boxes to tick. The others
 * are narrow because their job is narrow; widening them would not be a
 * setting, it would be a different assistant.
 */

export function AssistantsTable({
  enabled,
  onSaved,
}: {
  /** The scopes the owner turned on for business intelligence. */
  enabled: string[];
  onSaved: (scopes: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggle(scope: AiScope) {
    const next = enabled.includes(scope) ? enabled.filter((s) => s !== scope) : [...enabled, scope];
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ intelligenceScopes: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذّر الحفظ');
      onSaved(next);
      setMsg({ ok: true, text: 'حُفظ.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-[#f8fafc] px-3 py-2.5 text-[11px] leading-relaxed text-[#697586]">
        كل مساعد يقرأ ما هو مكتوب في سطره فقط — الخدمة ترفض جلب غيره، فالسطر وعدٌ يحفظه الكود لا وصفٌ
        على برومبت. ولا مساعد، مهما كان نطاقه، ينقل حالة طلب أو يسجّل حركة صندوق أو يغيّر سعراً أو
        يعتمد تسوية.
      </p>

      <div className="overflow-hidden rounded-xl border border-[#e3e8ef] bg-white">
        <table className="w-full text-xs">
          <thead className="border-b border-[#e3e8ef] bg-[#f8fafc] text-[#697586]">
            <tr>
              <th className="px-3 py-2 text-right font-medium">المساعد</th>
              <th className="px-3 py-2 text-right font-medium">لمن</th>
              <th className="px-3 py-2 text-right font-medium">يقرأ</th>
              <th className="px-3 py-2 text-right font-medium">بيانات الزبون</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e3e8ef]">
            {ASSISTANTS.map((a) => (
              <tr key={a.key} className="align-top">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-[#121926]">{a.label}</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#697586]">{a.note}</p>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[#364152]">
                  {a.who}
                  <span className="mt-0.5 block text-[10px] text-[#9aa4b2]" dir="ltr">{a.needs}</span>
                </td>
                <td className="px-3 py-2.5">
                  {a.scopes.length === 0 && !a.optionalScopes ? (
                    <span className="text-[#9aa4b2]">لا شيء من قاعدة البيانات</span>
                  ) : (
                    <span className="text-[#364152]">
                      {a.scopes.map((s) => SCOPE_LABEL_AR[s]).join(' · ') || '—'}
                    </span>
                  )}
                  {a.optionalScopes && (
                    <span className="mt-0.5 block text-[10px] text-[#9aa4b2]">
                      {enabled.length === 0 ? 'ولا مجال مؤشَّر' : `مؤشَّر: ${enabled.map((s) => SCOPE_LABEL_AR[s as AiScope]).join(' · ')}`}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {a.pii ? (
                    <span className="inline-flex items-center gap-1 text-[#c07f2a]">
                      <ShieldCheck className="h-3 w-3" /> نعم
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#00a651]">
                      <ShieldOff className="h-3 w-3" /> لا — أبداً
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The one assistant whose reach is a decision rather than a job. */}
      <section className="rounded-xl border border-[#e3e8ef] bg-white p-4">
        <h3 className="text-sm font-bold text-[#121926]">ما يقرؤه مركز الذكاء</h3>
        <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-[#697586]">
          يبدأ بلا مجال واحد. أشّر ما تسمح له بقراءته — وغير المؤشَّر لا يُجلَب أصلاً، فلا يمكن
          استخراجه بسؤال ذكي.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {AI_SCOPES.filter((s) => s !== 'customer').map((scope) => (
            <label
              key={scope}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${
                enabled.includes(scope) ? 'border-[#c9e8d5] bg-[#f6fcf8]' : 'border-[#e3e8ef]'
              }`}
            >
              <input
                type="checkbox"
                checked={enabled.includes(scope)}
                disabled={busy}
                onChange={() => void toggle(scope)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-xs font-semibold text-[#121926]">{SCOPE_LABEL_AR[scope]}</span>
                <span className="block text-[10.5px] leading-relaxed text-[#697586]">{SCOPE_NOTE_AR[scope]}</span>
              </span>
            </label>
          ))}
        </div>
        {msg && (
          <p className={`mt-2 text-[11px] ${msg.ok ? 'text-[#00a651]' : 'text-[#fb323f]'}`}>{msg.text}</p>
        )}
      </section>
    </div>
  );
}
