'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Plus, Link2, Check, Loader2, Pencil, Trash2, X, TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { CAMPAIGN_PLATFORMS, CAMPAIGN_STATUSES } from '@/lib/campaigns';

/**
 * WHAT EACH AD COST, AND WHAT IT BROUGHT BACK.
 *
 * The spend is the one number the seller types. Everything beside it —
 * orders, confirmations, deliveries, money collected — is measured from
 * this system's own records, through the same engine the moderator and
 * channel reports use. So "revenue" means the same thing here as on the
 * profit screen, which is the only way two screens can be trusted about
 * one week.
 *
 * The column that decides things is ROAS, and it is coloured rather than
 * merely printed: a seller scanning nine campaigns at midnight should see
 * which one to switch off without reading a single number.
 *
 * `net` is revenue minus ad spend and nothing else — not profit. The goods
 * cost money too, and that sum belongs on the profit screen where the cost
 * of delivery and commission are also known. Printing it as profit here
 * would have somebody reading a figure too high by everything they sold.
 */

interface Money {
  spend: number; revenue: number; net: number;
  roas: number | null; costPerDelivered: number | null; costPerOrder: number | null;
}
interface Funnel {
  brought: number; confirmed: number; rejected: number; delivered: number; returned: number;
  confirmationRate: number | null; deliveryRate: number | null;
}
interface Campaign {
  id: string; name: string; platform: string; code: string; status: string;
  startDate: string; endDate: string | null; notes: string | null;
  landingPage: { id: string; name: string; slug: string } | null;
  link: string; ranInWindow: boolean; funnel: Funnel; money: Money;
}
interface Payload {
  campaigns: Campaign[];
  totals: Money & { brought: number; delivered: number };
  currency: string;
  definitions: Record<string, string>;
}

const PERIODS = [
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'last_30', label: 'آخر ٣٠ يوماً' },
  { key: 'last_month', label: 'الشهر الماضي' },
  { key: 'all', label: 'كل الوقت' },
] as const;

const platformLabel = (k: string) => CAMPAIGN_PLATFORMS.find((p) => p.key === k)?.label ?? k;
const statusLabel = (k: string) => CAMPAIGN_STATUSES.find((s) => s.key === k)?.label ?? k;
const fmt = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function CampaignsScreen() {
  const [data, setData] = useState<Payload | null>(null);
  const [period, setPeriod] = useState<string>('this_month');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/growth/campaigns?period=${period}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch('/api/landing-pages')
      .then((r) => r.json())
      .then((j) => setPages((j.pages || j.landingPages || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => setPages([]));
  }, []);

  async function copy(link: string, id: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* a browser that refuses the clipboard still shows the link below */
    }
  }

  async function remove(c: Campaign) {
    const hasOrders = c.funnel.brought > 0;
    const ok = await confirm({
      title: hasOrders ? `إنهاء «${c.name}»؟` : `حذف «${c.name}»؟`,
      body: hasOrders
        ? `جاءت بـ${c.funnel.brought} طلباً. ستُنهى بدل أن تُحذف، حتى تبقى تلك الطلبات تعرف من أين جاءت.`
        : 'لم تأتِ بأي طلب بعد، فلا شيء يفقد ذاكرته بحذفها.',
      confirmLabel: hasOrders ? 'أنهِ الحملة' : 'احذف',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    });
    if (!ok) return;
    await fetch(`/api/growth/campaigns/${c.id}`, { method: 'DELETE' });
    await load();
  }

  const totals = data?.totals;
  const currency = data?.currency ?? '';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
            <Megaphone className="h-5 w-5 text-[#b8256e]" /> الحملات
          </h1>
          <p className="mt-0.5 text-xs text-[#697586]">
            تكتب ما أنفقت، والباقي محسوب من طلباتك الفعلية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[#e3e8ef] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  period === p.key ? 'bg-[#fdf2f7] text-[#b8256e]' : 'text-[#697586] hover:bg-[#f8fafc]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> حملة جديدة
          </Button>
        </div>
      </div>

      {/* The shop's whole picture, so nobody adds the column up by hand. */}
      {totals && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Stat label="أُنفق" value={`${fmt(totals.spend)} ${currency}`} />
          <Stat label="عاد" value={`${fmt(totals.revenue)} ${currency}`} />
          <Stat
            label="الفرق"
            value={`${fmt(totals.net)} ${currency}`}
            tone={totals.net >= 0 ? 'good' : 'bad'}
            hint="قبل كلفة البضاعة والتوصيل"
          />
          <Stat label="العائد على الإنفاق" value={totals.roas === null ? '—' : `${fmt(totals.roas)}×`} tone={roasTone(totals.roas)} />
          <Stat label="طلبات · وصلت" value={`${totals.brought} · ${totals.delivered}`} />
        </div>
      )}

      {loading && !data ? (
        <div className="flex h-40 items-center justify-center text-sm text-[#697586]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : data && data.campaigns.length === 0 ? (
        <Empty onCreate={() => setCreating(true)} />
      ) : (
        <div className="space-y-2">
          {data?.campaigns.map((c) => (
            <Row
              key={c.id}
              c={c}
              currency={currency}
              copied={copied === c.id}
              onCopy={() => copy(c.link, c.id)}
              onEdit={() => setEditing(c)}
              onRemove={() => remove(c)}
            />
          ))}
        </div>
      )}

      {data && (
        <p className="text-[10px] leading-relaxed text-[#9aa4b2]">
          «الفرق» هو الإيراد ناقص الإنفاق الإعلاني فقط — ليس الربح: كلفة البضاعة والتوصيل والعمولة
          محسوبة في شاشة الأرباح. و«الإيراد» هو المحصَّل فعلاً حيث نعرفه وإجمالي الطلب حيث لا نعرفه،
          نفس التعريف في كل الشاشات.
        </p>
      )}

      {(creating || editing) && (
        <Editor
          campaign={editing}
          pages={pages}
          currency={currency}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

/** Green above 2×, amber from 1 to 2, red below — losing money. */
function roasTone(roas: number | null): 'good' | 'warn' | 'bad' | undefined {
  if (roas === null) return undefined;
  if (roas >= 2) return 'good';
  if (roas >= 1) return 'warn';
  return 'bad';
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad'; hint?: string }) {
  const colour =
    tone === 'good' ? 'text-[#00994d]' : tone === 'bad' ? 'text-[#fb323f]' : tone === 'warn' ? 'text-[#b45309]' : 'text-[#121926]';
  return (
    <div className="rounded-xl border border-[#e3e8ef] bg-white p-3">
      <p className="text-[10px] font-semibold text-[#697586]">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${colour}`} dir="ltr">{value}</p>
      {hint && <p className="mt-0.5 text-[9px] text-[#9aa4b2]">{hint}</p>}
    </div>
  );
}

function Row({
  c, currency, copied, onCopy, onEdit, onRemove,
}: {
  c: Campaign; currency: string; copied: boolean;
  onCopy: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const tone = roasTone(c.money.roas);
  return (
    <div className="rounded-xl border border-[#e3e8ef] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-[#121926]">{c.name}</span>
            <span className="rounded bg-[#f1f3f6] px-1.5 py-0.5 text-[9px] font-semibold text-[#697586]">
              {platformLabel(c.platform)}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                c.status === 'ACTIVE' ? 'bg-[#e6f9ee] text-[#00994d]'
                : c.status === 'PAUSED' ? 'bg-[#fff7e6] text-[#b45309]'
                : 'bg-[#f1f3f6] text-[#697586]'
              }`}
            >
              {statusLabel(c.status)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[#697586]">
            {c.landingPage ? c.landingPage.name : 'واجهة المتجر'} · الرمز {c.code}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            title="انسخ رابط الإعلان"
            className="flex items-center gap-1 rounded-lg border border-[#e3e8ef] px-2 py-1 text-[10px] font-semibold text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
          >
            {copied ? <Check className="h-3 w-3 text-[#00994d]" /> : <Link2 className="h-3 w-3" />}
            {copied ? 'نُسخ' : 'رابط الإعلان'}
          </button>
          <button onClick={onEdit} title="تعديل" className="rounded p-1.5 text-[#697586] hover:bg-[#f8fafc]">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onRemove} title="حذف" className="rounded p-1.5 text-[#697586] hover:bg-rose-50 hover:text-rose-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-[#f1f3f6] pt-2.5 sm:grid-cols-6">
        <Cell label="أُنفق" value={`${fmt(c.money.spend)}`} unit={currency} />
        <Cell label="عاد" value={`${fmt(c.money.revenue)}`} unit={currency} />
        <Cell label="الفرق" value={`${fmt(c.money.net)}`} unit={currency} tone={c.money.net >= 0 ? 'good' : 'bad'} />
        <Cell
          label="العائد"
          value={c.money.roas === null ? '—' : `${fmt(c.money.roas)}×`}
          tone={tone}
          icon={tone === 'good' ? 'up' : tone === 'bad' ? 'down' : undefined}
        />
        <Cell label="كلفة الطلب" value={fmt(c.money.costPerOrder)} unit={currency} />
        <Cell label="كلفة الواصل" value={fmt(c.money.costPerDelivered)} unit={currency} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#697586]">
        <span>طلبات <b className="text-[#121926]">{c.funnel.brought}</b></span>
        <span>مؤكدة <b className="text-[#121926]">{c.funnel.confirmed}</b>{c.funnel.confirmationRate !== null && ` (${c.funnel.confirmationRate}%)`}</span>
        <span>وصلت <b className="text-[#121926]">{c.funnel.delivered}</b>{c.funnel.deliveryRate !== null && ` (${c.funnel.deliveryRate}%)`}</span>
        {c.funnel.returned > 0 && <span className="text-[#b45309]">مرتجعة {c.funnel.returned}</span>}
        {/* A zero that says why it is zero. */}
        {c.funnel.brought === 0 && !c.ranInWindow && (
          <span className="text-[#9aa4b2]">لم تكن تعمل في هذه المدة</span>
        )}
      </div>

      <p className="mt-1.5 truncate font-mono text-[9px] text-[#9aa4b2]" dir="ltr" title={c.link}>
        {c.link}
      </p>
    </div>
  );
}

function Cell({ label, value, unit, tone, icon }: { label: string; value: string; unit?: string; tone?: 'good' | 'warn' | 'bad'; icon?: 'up' | 'down' }) {
  const colour =
    tone === 'good' ? 'text-[#00994d]' : tone === 'bad' ? 'text-[#fb323f]' : tone === 'warn' ? 'text-[#b45309]' : 'text-[#121926]';
  return (
    <div>
      <p className="text-[9px] text-[#9aa4b2]">{label}</p>
      <p className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${colour}`} dir="ltr">
        {icon === 'up' && <TrendingUp className="h-3 w-3" />}
        {icon === 'down' && <TrendingDown className="h-3 w-3" />}
        {value}
        {unit && value !== '—' && <span className="text-[9px] font-normal text-[#9aa4b2]">{unit}</span>}
      </p>
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[#c9d2e0] p-8 text-center">
      <Megaphone className="mx-auto h-8 w-8 text-[#c9d2e0]" />
      <p className="mt-2 text-sm font-semibold text-[#364152]">لا حملات بعد</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#697586]">
        أنشئ حملة، انسخ رابطها، والصقه في إعلانك. كل طلب يأتي من ذلك الرابط يُحسب عليها —
        وأنت تكتب ما أنفقت، فترى العائد الحقيقي بدل التخمين.
      </p>
      <Button size="sm" className="mt-3" onClick={onCreate}>
        <Plus className="h-4 w-4" /> حملة جديدة
      </Button>
    </div>
  );
}

function Editor({
  campaign, pages, currency, onClose, onSaved,
}: {
  campaign: Campaign | null;
  pages: { id: string; name: string }[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    platform: campaign?.platform ?? 'META',
    landingPageId: campaign?.landingPage?.id ?? '',
    status: campaign?.status ?? 'ACTIVE',
    startDate: campaign?.startDate?.slice(0, 10) ?? today,
    endDate: campaign?.endDate?.slice(0, 10) ?? '',
    spend: String(campaign?.money.spend ?? 0),
    notes: campaign?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        platform: form.platform,
        landingPageId: form.landingPageId || null,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate || null,
        spend: form.spend,
        notes: form.notes || null,
      };
      const res = await fetch(campaign ? `/api/growth/campaigns/${campaign.id}` : '/api/growth/campaigns', {
        method: campaign ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الحفظ');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#121926]">{campaign ? 'تعديل الحملة' : 'حملة جديدة'}</h2>
          <button onClick={onClose} className="rounded p-1 text-[#697586] hover:bg-[#f8fafc]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="اسم الحملة">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثلاً: عرض رمضان — فيديو ١"
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="المنصّة">
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={INPUT}>
                {CAMPAIGN_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="الحالة">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT}>
                {CAMPAIGN_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="تذهب إلى" hint="اتركها فارغة لتذهب إلى واجهة المتجر">
            <select value={form.landingPageId} onChange={(e) => setForm({ ...form, landingPageId: e.target.value })} className={INPUT}>
              <option value="">واجهة المتجر</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="تبدأ">
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={INPUT} />
            </Field>
            <Field label="تنتهي" hint="اتركها فارغة إن كانت مستمرة">
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={INPUT} />
            </Field>
          </div>

          <Field label={`ما أنفقته (${currency})`} hint="الرقم من مدير إعلاناتك. حدّثه كلما أنفقت أكثر.">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.spend}
              onChange={(e) => setForm({ ...form, spend: e.target.value })}
              className={INPUT}
              dir="ltr"
            />
          </Field>

          <Field label="ملاحظات">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={INPUT}
              placeholder="الجمهور، الفيديو المستخدم، أي شيء تريد تذكّره"
            />
          </Field>

          {campaign && (
            <p className="rounded-lg bg-[#f8fafc] p-2 text-[10px] leading-relaxed text-[#697586]">
              الرمز <b className="font-mono">{campaign.code}</b> لا يتغيّر — فهو مطبوع على كل طلب جاءت به
              هذه الحملة. حملة تحتاج رمزاً جديداً هي حملة جديدة.
            </p>
          )}

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={save} disabled={busy || !form.name.trim()} className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {campaign ? 'احفظ' : 'أنشئ الحملة'}
          </Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-[#e3e8ef] bg-white px-3 py-2 text-sm text-[#121926] outline-none focus:border-[#b8256e]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-[#364152]">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[9px] text-[#9aa4b2]">{hint}</p>}
    </div>
  );
}
