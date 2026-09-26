'use client';

import React, { useState } from 'react';
import {
  ASSISTANTS, AI_SCOPES, SCOPE_LABEL_AR, SCOPE_NOTE_AR, type AiScope,
} from '@/lib/ai-assistants';
import { RiShieldCheckLine, RiShieldCrossLine } from '@remixicon/react';
import { Rows } from '@/components/ui/Rows';

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
      <p className="rounded-lg bg-[var(--sys-surface)] px-3 py-2.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
        كل مساعد يقرأ ما هو مكتوب في سطره فقط — الخدمة ترفض جلب غيره، فالسطر وعدٌ يحفظه الكود لا وصفٌ
        على برومبت. ولا مساعد، مهما كان نطاقه، ينقل حالة طلب أو يسجّل حركة صندوق أو يغيّر سعراً أو
        يعتمد تسوية.
      </p>

      <div className="overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
                <Rows
          rows={ASSISTANTS}
          keyOf={(a) => a.key}
          columns={[
            { key: 'c0', label: "المساعد", primary: true,
              render: (a) => (
                  <><p className="font-semibold text-[var(--sys-heading)]">{a.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{a.note}</p></>
                ) },
            { key: 'c1', label: "لمن", primary: true,
              render: (a) => (
                  <>{a.who}
                  <span className="mt-0.5 block text-xs text-[var(--sys-muted)]" dir="ltr">{a.needs}</span></>
                ) },
            { key: 'c2', label: "يقرأ",
              render: (a) => (
                  <>{a.scopes.length === 0 && !a.optionalScopes ? (
                    <span className="text-[var(--sys-muted)]">لا شيء من قاعدة البيانات</span>
                  ) : (
                    <span className="text-[var(--sys-foreground)]">
                      {a.scopes.map((s) => SCOPE_LABEL_AR[s]).join(' · ') || '—'}
                    </span>
                  )}
                  {a.optionalScopes && (
                    <span className="mt-0.5 block text-xs text-[var(--sys-muted)]">
                      {enabled.length === 0 ? 'ولا مجال مؤشَّر' : `مؤشَّر: ${enabled.map((s) => SCOPE_LABEL_AR[s as AiScope]).join(' · ')}`}
                    </span>
                  )}</>
                ) },
            { key: 'c3', label: "بيانات الزبون",
              render: (a) => (a.pii ? (
                    <span className="inline-flex items-center gap-1 text-[var(--sys-warning)]">
                      <RiShieldCheckLine className="h-4 w-4" /> نعم
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[var(--sys-success)]">
                      <RiShieldCrossLine className="h-4 w-4" /> لا — أبداً
                    </span>
                  )) },
          ]}
        />
      </div>

      {/* The one assistant whose reach is a decision rather than a job. */}
      <section className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4">
        <h3 className="text-sm font-bold text-[var(--sys-heading)]">ما يقرؤه مركز الذكاء</h3>
        <p className="mb-3 mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          يبدأ بلا مجال واحد. أشّر ما تسمح له بقراءته — وغير المؤشَّر لا يُجلَب أصلاً، فلا يمكن
          استخراجه بسؤال ذكي.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {AI_SCOPES.filter((s) => s !== 'customer').map((scope) => (
            <label
              key={scope}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${
                enabled.includes(scope) ? 'border-[var(--sys-success-soft)] bg-[var(--sys-success-soft)]' : 'border-[var(--sys-border)]'
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
                <span className="block text-xs font-semibold text-[var(--sys-heading)]">{SCOPE_LABEL_AR[scope]}</span>
                <span className="block text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{SCOPE_NOTE_AR[scope]}</span>
              </span>
            </label>
          ))}
        </div>
        {msg && (
          <p className={`mt-2 text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{msg.text}</p>
        )}
      </section>
    </div>
  );
}
