'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, ShieldQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';
import { ROLE_LABELS } from '@/types/auth';

/**
 * THE RULES THAT PROPOSE A DEDUCTION.
 *
 * None of them applies one — that is always a person, on the deductions
 * screen, with their name on the decision.
 *
 * Grace and a cap are asked for on the same line as the price, not hidden
 * behind "advanced". A rule with no grace charges somebody every day
 * traffic exists, and a deduction that happens daily stops being a signal.
 * A rule with no cap can eat a salary over one illness. Both are mistakes
 * nobody notices until payday, which is the worst moment to notice one.
 */

interface Kind {
  key: string;
  ar: string;
  unitAr: string;
  sourceAr: string;
}
interface Rule {
  id: string;
  kind: string;
  role: string | null;
  perUnit: number;
  grace: number;
  periodCap: number | null;
  currencyCode: string;
  isActive: boolean;
}

const FIELD =
  'h-9 rounded-lg border border-[#e3e8ef] bg-white px-2 text-xs text-[#364152] outline-none focus:border-[#b8256e]';

export function PenaltyRulesCard() {
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    kind: 'LATE',
    role: '',
    perUnit: '',
    grace: '10',
    periodCap: '',
    currencyCode: '',
  });

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ kinds: Kind[]; roles: string[]; rules: Rule[] }>('/api/settings/penalty-rules');
      setKinds(d.kinds ?? []);
      setRoles(d.roles ?? []);
      setRules(d.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rules) return null;

  const kind = kinds.find((k) => k.key === draft.kind);
  const ready = Number(draft.perUnit) > 0 && /^[A-Za-z]{3}$/.test(draft.currencyCode.trim());

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/settings/penalty-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: draft.kind,
          role: draft.role || null,
          perUnit: Number(draft.perUnit),
          grace: Number(draft.grace || 0),
          periodCap: draft.periodCap ? Number(draft.periodCap) : null,
          currencyCode: draft.currencyCode.trim().toUpperCase(),
        }),
      });
      setDraft({ ...draft, perUnit: '', periodCap: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule: Rule) => {
    setBusy(true);
    try {
      await apiJson('/api/settings/penalty-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="قواعد الخصم"
        subtitle="تقترح فقط — لا خصم يصير مالاً إلا بقرار إنسان على شاشة «الخصومات»"
      />
      <CardContent className="space-y-3">
        {rules.length === 0 && (
          <p className="rounded-lg border border-[#e3e8ef] bg-[#f8fafc] p-3 text-xs leading-relaxed text-[#697586]">
            لا قواعد بعد، فلا يُقترح أي خصم على أحد. الصمت ليس خصماً.
          </p>
        )}

        {rules.map((r) => {
          const k = kinds.find((x) => x.key === r.kind);
          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs ${
                r.isActive ? 'border-[#e3e8ef]' : 'border-dashed border-[#e3e8ef] bg-[#fafbfc]'
              }`}
            >
              <span className="font-semibold text-[#121926]">{k?.ar ?? r.kind}</span>
              <span className="text-[#697586]">
                {r.role ? (ROLE_LABELS[r.role as keyof typeof ROLE_LABELS]?.ar ?? r.role) : 'كل الأدوار'}
              </span>
              <span className="tabular-nums text-[#364152]" dir="ltr">
                {r.perUnit} {r.currencyCode}/{k?.unitAr}
              </span>
              <span className="text-[#697586]">
                سماح <span className="tabular-nums">{r.grace}</span>
              </span>
              <span className="text-[#697586]">
                سقف{' '}
                {r.periodCap === null ? (
                  <span className="text-[#fb323f]">بلا</span>
                ) : (
                  <span className="tabular-nums">{r.periodCap}</span>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(r)}
                className="ms-auto rounded border border-[#e3e8ef] px-2 py-0.5 text-[10px] text-[#697586]"
              >
                {r.isActive ? 'أوقفها' : 'شغّلها'}
              </button>
            </div>
          );
        })}

        <div className="rounded-lg border border-[#e3e8ef] p-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-[#697586]">النوع</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={`${FIELD} w-36`}>
                {kinds.map((k) => (
                  <option key={k.key} value={k.key}>{k.ar}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-[#697586]">الدور</span>
              <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={`${FIELD} w-32`}>
                <option value="">كل الأدوار</option>
                {roles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS]?.ar ?? r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-[#697586]">لكل {kind?.unitAr}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.perUnit}
                onChange={(e) => setDraft({ ...draft, perUnit: e.target.value })}
                className={`${FIELD} w-24`}
                dir="ltr"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-[#697586]">العملة</span>
              <input
                value={draft.currencyCode}
                onChange={(e) => setDraft({ ...draft, currencyCode: e.target.value })}
                maxLength={3}
                placeholder="SYP"
                className={`${FIELD} w-20`}
                dir="ltr"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-[#697586]">سماح ({kind?.unitAr})</span>
              <input
                type="number"
                min={0}
                value={draft.grace}
                onChange={(e) => setDraft({ ...draft, grace: e.target.value })}
                className={`${FIELD} w-24`}
                dir="ltr"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-[#697586]">سقف الفترة</span>
              <input
                type="number"
                min={0}
                value={draft.periodCap}
                onChange={(e) => setDraft({ ...draft, periodCap: e.target.value })}
                placeholder="بلا"
                className={`${FIELD} w-24`}
                dir="ltr"
              />
            </label>
            <Button size="sm" onClick={add} disabled={busy || !ready}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              أضف قاعدة
            </Button>
          </div>

          {kind && <p className="mt-2 text-[10px] leading-relaxed text-[#9aa4b2]">{kind.sourceAr}</p>}
          {!draft.periodCap && (
            <p className="mt-1 flex items-start gap-1 text-[10px] leading-relaxed text-[#c07f2a]">
              <ShieldQuestion className="mt-px h-3 w-3 shrink-0" />
              بلا سقف، قاعدةٌ بالدقيقة قد تأكل راتباً كاملاً على مرضٍ واحد.
            </p>
          )}
        </div>

        {error && <p className="rounded-lg border border-[#fecdd1] bg-[#feecee] p-2.5 text-xs text-[#fb323f]">{error}</p>}
      </CardContent>
    </Card>
  );
}
