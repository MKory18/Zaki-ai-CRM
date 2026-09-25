'use client';

import {
  METRIC_LABEL_AR, PERIOD_LABEL_AR,
  type CommissionMetric, type CommissionPeriod, type CommissionType, type Tier,
} from '@/lib/commission-rules';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Percent, Plus } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

/**
 * /settings/commission — commission rules are dated data, not settings. A
 * rule is never edited in place: you end the old one on a date and write a
 * new one from the next, so anything already accrued keeps the rule that was
 * in force on its delivery day.
 */


/** A rule's single value, said the way its type means it. */
function valueLabel(type: CommissionType, value: number): string {
  if (type === 'PERCENT') return `${value}%`;
  return type === 'PER_ORDER' ? `${value} لكل طلب` : `${value} ثابت`;
}

interface Rule {
  id: string;
  name: string;
  appliesToRole: string | null;
  appliesToUserId: string | null;
  appliesToUserName: string | null;
  type: CommissionType;
  value: number;
  metric: CommissionMetric;
  period: CommissionPeriod;
  tiers: Tier[] | null;
  minOrders: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  /** In force right now — not merely active with a future or past date. */
  inForce: boolean;
  minSampleOrders: number;
}

interface Totals {
  userId: string;
  name: string;
  accrued: number;
  payable: number;
  paid: number;
  reversed: number;
}

const ROLES = [
  { value: 'MODERATOR', label: 'مسوّق' },
  { value: 'CONFIRMER', label: 'مؤكِّد طلبات' },
  { value: 'SHIPPING', label: 'شحن' },
  { value: 'ACCOUNTANT', label: 'محاسب' },
];

const period = () => new Date().toISOString().slice(0, 7);

export function CommissionSettingsScreen() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  /** No rule governs this store today: nothing accrues, and it must be said. */
  const [noRuleInForce, setNoRuleInForce] = useState(false);
  const [totals, setTotals] = useState<Totals[] | null>(null);
  const [currency, setCurrency] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [endFor, setEndFor] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        apiJson<{ rules: Rule[]; noRuleInForce: boolean }>('/api/settings/commission'),
        apiJson<{ totals: Totals[]; currencyCode: string }>(`/api/finance/commission?period=${period()}`).catch(() => null),
      ]);
      setRules(r.rules);
      setNoRuleInForce(!!r.noRuleInForce);
      if (c) {
        setTotals(c.totals);
        setCurrency(c.currencyCode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl space-y-3">
      <p className="text-xs text-[#697586] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3">
        القاعدة لا تُعدَّل بعد كتابتها: لإنهاء العمل بها حدِّد لها تاريخ انتهاء واكتب قاعدة جديدة من اليوم التالي.
        العمولة تُحتسب بالقاعدة السارية يوم التسليم، وتصبح مستحقة عند اعتماد كشف التحصيل.
      </p>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-3">{done}</p>}

      <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e3e8ef]">
          <h2 className="text-sm font-medium text-[#121926]">قواعد العمولة</h2>
          <button
            onClick={() => setNewOpen(true)}
            className="h-8 px-3 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> قاعدة جديدة
          </button>
        </div>

        {/* A store with no rule in force earns nobody anything. That is
            correct arithmetic and reads on a payslip as a quiet month, so
            the screen says which it is instead of showing a silent zero. */}
        {noRuleInForce && rules && rules.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-xs leading-relaxed text-[#92400e]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              لا قاعدة سارية على هذا المتجر اليوم — القواعد الموجودة إمّا منتهية أو معطّلة، فلا تُحتسب أي
              عمولة. أضف قاعدة سارية ليبدأ الاحتساب.
            </span>
          </div>
        )}

        {!rules ? (
          <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-12">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-[#697586] py-10 text-center">
            <Percent className="w-5 h-5 mx-auto mb-2 text-[#9aa4b2]" />
            لا قواعد بعد — بدون قاعدة لا تُحتسب أي عمولة.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">القاعدة</th>
                <th className="text-right font-medium px-3 py-2">تنطبق على</th>
                <th className="text-right font-medium px-3 py-2">يُحتسب على</th>
                <th className="text-right font-medium px-3 py-2">القيمة</th>
                <th className="text-right font-medium px-3 py-2">من</th>
                <th className="text-right font-medium px-3 py-2">إلى</th>
                <th className="text-right font-medium px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {rules.map((r) => {
                const ended = !!r.effectiveTo || !r.isActive;
                return (
                  <tr key={r.id} className={ended ? 'text-[#9aa4b2]' : undefined}>
                    <td className="px-3 py-2 font-medium text-[#121926]">{r.name}</td>
                    <td className="px-3 py-2">
                      {r.appliesToUserName
                        ? r.appliesToUserName
                        : ROLES.find((x) => x.value === r.appliesToRole)?.label ?? r.appliesToRole ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#697586]">
                      {METRIC_LABEL_AR[r.metric] ?? r.metric}
                      {r.period !== 'PER_ORDER' && ` · ${PERIOD_LABEL_AR[r.period] ?? r.period}`}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.tiers && r.tiers.length > 0 ? (
                        <span title={r.tiers.map((t) => `${t.from}${t.to === null ? '+' : `–${t.to}`}: ${t.value}`).join(' · ')}>
                          {r.tiers.length} شرائح
                        </span>
                      ) : (
                        valueLabel(r.type, r.value)
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums" dir="ltr">
                      {String(r.effectiveFrom).slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums" dir="ltr">
                      {r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : '—'}
                    </td>
                    <td className="px-3 py-2 text-left">
                      {!ended && (
                        <button onClick={() => setEndFor(r)} className="text-xs text-[#b8256e] hover:underline">
                          إنهاء العمل بها
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
        <h2 className="text-sm font-medium text-[#121926] px-4 py-3 border-b border-[#e3e8ef]">
          عمولات الشهر الحالي ({period()})
        </h2>
        {!totals ? (
          <p className="text-sm text-[#697586] py-8 text-center">—</p>
        ) : totals.length === 0 ? (
          <p className="text-sm text-[#697586] py-8 text-center">لا عمولات محتسبة هذا الشهر.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">الموظف</th>
                <th className="text-right font-medium px-3 py-2">محتسبة</th>
                <th className="text-right font-medium px-3 py-2">مستحقة</th>
                <th className="text-right font-medium px-3 py-2">مدفوعة</th>
                <th className="text-right font-medium px-3 py-2">معكوسة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {totals.map((t) => (
                <tr key={t.userId}>
                  <td className="px-3 py-2 text-[#364152]">{t.name}</td>
                  <td className="px-3 py-2 tabular-nums">{t.accrued} {currency}</td>
                  <td className="px-3 py-2 tabular-nums text-[#00a344]">{t.payable}</td>
                  <td className="px-3 py-2 tabular-nums text-[#697586]">{t.paid}</td>
                  <td className="px-3 py-2 tabular-nums text-[#fb323f]">{t.reversed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {newOpen && (
        <NewRuleDialog
          onClose={() => setNewOpen(false)}
          onSaved={async () => {
            setNewOpen(false);
            setDone('أُضيفت القاعدة');
            await load();
          }}
        />
      )}

      {endFor && (
        <EndRuleDialog
          rule={endFor}
          onClose={() => setEndFor(null)}
          onSaved={async () => {
            setEndFor(null);
            setDone('أُنهي العمل بالقاعدة — ما احتُسب سابقاً باقٍ كما هو');
            await load();
          }}
        />
      )}
    </div>
  );
}

function NewRuleDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('MODERATOR');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title="قاعدة عمولة جديدة">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/settings/commission', {
              method: 'POST',
              body: JSON.stringify({
                name: name.trim(),
                appliesToRole: role,
                type,
                value: Number(value),
                effectiveFrom: from,
              }),
            });
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">اسم القاعدة</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="عمولة المسوّقين 2026"
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">تنطبق على دور</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="block text-xs font-medium text-[#364152] mb-1">النوع</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')}
              className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
            >
              <option value="PERCENT">نسبة مئوية</option>
              <option value="FIXED">مبلغ ثابت</option>
            </select>
          </label>
          <label>
            <span className="block text-xs font-medium text-[#364152] mb-1">
              {type === 'PERCENT' ? 'النسبة %' : 'المبلغ'}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
              dir="ltr"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">سارية من</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            dir="ltr"
          />
        </label>

        {error && <p className="text-sm text-[#fb323f]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[#e3e8ef] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EndRuleDialog({ rule, onClose, onSaved }: { rule: Rule; onClose: () => void; onSaved: () => void }) {
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title={`إنهاء العمل بـ «${rule.name}»`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/settings/commission', {
              method: 'PATCH',
              body: JSON.stringify({ ruleId: rule.id, effectiveTo: to }),
            });
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="text-sm text-[#364152] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3">
          الطلبات المسلَّمة حتى هذا التاريخ تبقى محسوبة بهذه القاعدة. لما بعده اكتب قاعدة جديدة.
        </p>
        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">آخر يوم تسري فيه</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            dir="ltr"
          />
        </label>
        {error && <p className="text-sm text-[#fb323f]">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[#e3e8ef] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium disabled:opacity-50"
          >
            إنهاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
