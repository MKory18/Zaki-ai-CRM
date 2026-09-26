'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { CAMPAIGN_PLATFORMS, CAMPAIGN_STATUSES } from '@/lib/campaigns';
import { RiAddCircleLine, RiArrowDownCircleLine, RiArrowUpCircleLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiLinksLine, RiLoader4Line, RiMegaphoneLine, RiPencilLine, RiPlugLine, RiRefreshLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';

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
interface AdAccount { id: string; accountId: string; accountName: string | null; status: string }
interface Campaign {
  id: string; name: string; platform: string; code: string; status: string;
  spendSource: 'MANUAL' | 'SYNCED';
  adAccount: { id: string; accountName: string | null; accountId: string; status: string } | null;
  externalId: string | null;
  lastSyncAt: string | null;
  startDate: string; endDate: string | null; notes: string | null;
  landingPage: { id: string; name: string; slug: string } | null;
  link: string; ranInWindow: boolean; funnel: Funnel; money: Money;
}
interface Payload {
  campaigns: Campaign[];
  totals: Money & { brought: number; delivered: number };
  currency: string;
  adAccounts: AdAccount[];
  definitions: Record<string, string>;
}

const PERIODS = [
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'last_30', label: 'آخر 30 يوماً' },
  { key: 'last_month', label: 'الشهر الماضي' },
  { key: 'all', label: 'كل الوقت' },
] as const;

const platformLabel = (k: string) => CAMPAIGN_PLATFORMS.find((p) => p.key === k)?.label ?? k;
const statusLabel = (k: string) => CAMPAIGN_STATUSES.find((s) => s.key === k)?.label ?? k;
const fmt = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function CampaignsScreen() {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [period, setPeriod] = useState<string>('this_month');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [linking, setLinking] = useState<Campaign | null>(null);
  const confirm = useConfirm();

  /**
   * Pull what was spent, for every campaign linked to an ad account.
   *
   * Only linked ones. A campaign whose spend the seller typed keeps its
   * typed number — a figure a person entered changing overnight, with no
   * explanation, is worse than a figure that was never automatic.
   */
  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/growth/campaigns/sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر السحب');
      await load();
      const failed = (json.accounts || []).filter((a: { error: string | null }) => a.error);
      setSyncMsg(
        failed.length
          ? failed.map((a: { account: string; error: string }) => `${a.account}: ${a.error}`).join(' · ')
          : json.message || `حُدِّثت ${json.updated} حملة.`
      );
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'تعذر السحب');
    } finally {
      setSyncing(false);
    }
  }

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
      <PageHeader title="الحملات"
          description="تكتب ما أنفقت، والباقي محسوب من طلباتك الفعلية."
          actions={
            <><div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--sys-border)] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  period === p.key ? 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]' : 'text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {(data?.adAccounts?.length ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
              {syncing ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiRefreshLine className="h-4 w-4" />}
              اسحب الإنفاق
            </Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            <RiAddCircleLine className="h-4 w-4" /> حملة جديدة
          </Button>
        </div></>
          }
        />

      {syncMsg && (
        <p className="rounded-lg bg-[var(--sys-surface)] px-3 py-2 text-xs text-[var(--sys-foreground)]">{syncMsg}</p>
      )}

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
        <div className="flex h-40 items-center justify-center text-sm text-[var(--sys-muted-foreground)]">
          <RiLoader4Line className="h-4 w-4 animate-spin" />
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
              onLink={(data?.adAccounts?.length ?? 0) > 0 ? () => setLinking(c) : undefined}
            />
          ))}
        </div>
      )}

      {data && (
        <p className="text-xs leading-relaxed text-[var(--sys-muted)]">
          «الفرق» هو الإيراد ناقص الإنفاق الإعلاني فقط — ليس الربح: كلفة البضاعة والتوصيل والعمولة
          محسوبة في شاشة الأرباح. و«الإيراد» هو المحصَّل فعلاً حيث نعرفه وإجمالي الطلب حيث لا نعرفه،
          نفس التعريف في كل الشاشات.
        </p>
      )}

      {linking && data && (
        <LinkDialog
          campaign={linking}
          accounts={data.adAccounts}
          onClose={() => setLinking(null)}
          onSaved={async () => { setLinking(null); await load(); }}
        />
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
    tone === 'good' ? 'text-[var(--sys-success)]' : tone === 'bad' ? 'text-[var(--sys-destructive)]' : tone === 'warn' ? 'text-[var(--sys-warning)]' : 'text-[var(--sys-heading)]';
  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
      <p className="text-xs font-semibold text-[var(--sys-muted-foreground)]">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${colour}`} dir="ltr">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--sys-muted)]">{hint}</p>}
    </div>
  );
}

function Row({
  c, currency, copied, onCopy, onEdit, onRemove, onLink,
}: {
  c: Campaign; currency: string; copied: boolean;
  onCopy: () => void; onEdit: () => void; onRemove: () => void; onLink?: () => void;
}) {
  const tone = roasTone(c.money.roas);
  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-[var(--sys-heading)]">{c.name}</span>
            <span className="rounded-lg bg-[var(--sys-surface-strong)] px-1.5 py-0.5 text-xs font-semibold text-[var(--sys-muted-foreground)]">
              {platformLabel(c.platform)}
            </span>
            <span
              className={`rounded-lg px-1.5 py-0.5 text-xs font-semibold ${
                c.status === 'ACTIVE' ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]'
                : c.status === 'PAUSED' ? 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]'
                : 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]'
              }`}
            >
              {statusLabel(c.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--sys-muted-foreground)]">
            {c.landingPage ? c.landingPage.name : 'واجهة المتجر'} · الرمز {c.code}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {onLink && (
            <button
              onClick={onLink}
              title={c.adAccount ? 'غيّر الربط بميتا' : 'اربطها بحملة في ميتا'}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                c.spendSource === 'SYNCED'
                  ? 'border-[var(--sys-success-soft)] bg-[var(--sys-success-soft)] text-[var(--sys-success)]'
                  : 'border-[var(--sys-border)] text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]'
              }`}
            >
              <RiPlugLine className="h-4 w-4" />
              {c.spendSource === 'SYNCED' ? 'تلقائي' : 'اربط'}
            </button>
          )}
          <button
            onClick={onCopy}
            title="انسخ رابط الإعلان"
            className="flex items-center gap-1 rounded-lg border border-[var(--sys-border)] px-2 py-1 text-xs font-semibold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
          >
            {copied ? <RiCheckLine className="h-4 w-4 text-[var(--sys-success)]" /> : <RiLinksLine className="h-4 w-4" />}
            {copied ? 'نُسخ' : 'رابط الإعلان'}
          </button>
          <button aria-label="تعديل" onClick={onEdit} title="تعديل" className="rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]">
            <RiPencilLine className="h-4 w-4" />
          </button>
          <button aria-label="حذف" onClick={onRemove} title="حذف" className="rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-destructive-soft)] hover:text-[var(--sys-destructive)]">
            <RiDeleteBinLine className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-[var(--sys-surface-strong)] pt-2.5 sm:grid-cols-6">
        <Cell
          label={c.spendSource === 'SYNCED' ? 'أُنفق · من ميتا' : 'أُنفق · يدوي'}
          value={`${fmt(c.money.spend)}`}
          unit={currency}
        />
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

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sys-muted-foreground)]">
        <span>طلبات <b className="text-[var(--sys-heading)]">{c.funnel.brought}</b></span>
        <span>مؤكدة <b className="text-[var(--sys-heading)]">{c.funnel.confirmed}</b>{c.funnel.confirmationRate !== null && ` (${c.funnel.confirmationRate}%)`}</span>
        <span>وصلت <b className="text-[var(--sys-heading)]">{c.funnel.delivered}</b>{c.funnel.deliveryRate !== null && ` (${c.funnel.deliveryRate}%)`}</span>
        {c.funnel.returned > 0 && <span className="text-[var(--sys-warning)]">مرتجعة {c.funnel.returned}</span>}
        {/* A zero that says why it is zero. */}
        {c.funnel.brought === 0 && !c.ranInWindow && (
          <span className="text-[var(--sys-muted)]">لم تكن تعمل في هذه المدة</span>
        )}
      </div>

      <p className="mt-1.5 truncate font-mono text-xs text-[var(--sys-muted)]" dir="ltr" title={c.link}>
        {c.link}
      </p>
    </div>
  );
}

function Cell({ label, value, unit, tone, icon }: { label: string; value: string; unit?: string; tone?: 'good' | 'warn' | 'bad'; icon?: 'up' | 'down' }) {
  const colour =
    tone === 'good' ? 'text-[var(--sys-success)]' : tone === 'bad' ? 'text-[var(--sys-destructive)]' : tone === 'warn' ? 'text-[var(--sys-warning)]' : 'text-[var(--sys-heading)]';
  return (
    <div>
      <p className="text-xs text-[var(--sys-muted)]">{label}</p>
      <p className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${colour}`} dir="ltr">
        {icon === 'up' && <RiArrowUpCircleLine className="h-4 w-4" />}
        {icon === 'down' && <RiArrowDownCircleLine className="h-4 w-4" />}
        {value}
        {unit && value !== '—' && <span className="text-xs font-normal text-[var(--sys-muted)]">{unit}</span>}
      </p>
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--sys-border-strong)] p-8 text-center">
      <RiMegaphoneLine className="mx-auto h-6 w-6 text-[var(--sys-border-strong)]" />
      <p className="mt-2 text-sm font-semibold text-[var(--sys-foreground)]">لا حملات بعد</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
        أنشئ حملة، انسخ رابطها، والصقه في إعلانك. كل طلب يأتي من ذلك الرابط يُحسب عليها —
        وأنت تكتب ما أنفقت، فترى العائد الحقيقي بدل التخمين.
      </p>
      <Button size="sm" className="mt-3" onClick={onCreate}>
        <RiAddCircleLine className="h-4 w-4" /> حملة جديدة
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--sys-sidebar)]/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-[var(--sys-card)] p-4 sm:rounded-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--sys-heading)]">{campaign ? 'تعديل الحملة' : 'حملة جديدة'}</h2>
          <button aria-label="إغلاق" onClick={onClose} className="rounded-lg p-1 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]">
            <RiCloseLine className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="اسم الحملة">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثلاً: عرض رمضان — فيديو 1"
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
            <p className="rounded-lg bg-[var(--sys-surface)] p-2 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
              الرمز <b className="font-mono">{campaign.code}</b> لا يتغيّر — فهو مطبوع على كل طلب جاءت به
              هذه الحملة. حملة تحتاج رمزاً جديداً هي حملة جديدة.
            </p>
          )}

          {error && <p className="text-xs font-medium text-[var(--sys-destructive)]">{error}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={save} disabled={busy || !form.name.trim()} className="flex-1">
            {busy ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : null}
            {campaign ? 'احفظ' : 'أنشئ الحملة'}
          </Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 py-2 text-sm text-[var(--sys-heading)] outline-none focus:border-[var(--sys-primary)]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[var(--sys-foreground)]">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-xs text-[var(--sys-muted)]">{hint}</p>}
    </div>
  );
}


/**
 * SAYING WHICH OF OURS IS WHICH OF THEIRS.
 *
 * Done once, by hand, and by id forever after. Matching by NAME would break
 * the first time somebody renamed a campaign in Ads Manager — which people
 * do constantly — and it would break silently: the spend would simply stop
 * attaching to anything, and the campaign would read as free.
 */
function LinkDialog({
  campaign, accounts, onClose, onSaved,
}: {
  campaign: Campaign;
  accounts: AdAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(campaign.adAccount?.id ?? accounts[0]?.id ?? '');
  const [remote, setRemote] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const [chosen, setChosen] = useState(campaign.externalId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    setRemote(null);
    setError(null);
    void fetch(`/api/settings/ad-accounts/${accountId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'تعذر جلب الحملات');
        setRemote(j.campaigns || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر جلب الحملات'));
  }, [accountId]);

  async function save(unlink = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/growth/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          unlink ? { adAccountId: null, externalId: null } : { adAccountId: accountId, externalId: chosen }
        ),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'تعذر الحفظ');
      onSaved();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--sys-sidebar)]/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-[var(--sys-card)] p-4 sm:rounded-lg"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--sys-heading)]">اربط «{campaign.name}» بحملة في ميتا</h2>
          <button aria-label="إغلاق" onClick={onClose} className="rounded-lg p-1 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]">
            <RiCloseLine className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          بعدها يأتي الإنفاق تلقائياً. الربط بالمعرّف لا بالاسم — فتغيير اسم الحملة في ميتا
          لن يقطعه.
        </p>

        {accounts.length > 1 && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-[var(--sys-foreground)]">الحساب الإعلاني</label>
            <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setChosen(''); }} className={INPUT}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.accountName ?? a.accountId}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="mb-2 rounded-lg bg-[var(--sys-destructive-soft)] p-2 text-xs text-[var(--sys-destructive)]">{error}</p>}

        {remote === null && !error ? (
          <div className="flex h-24 items-center justify-center text-[var(--sys-muted-foreground)]">
            <RiLoader4Line className="h-4 w-4 animate-spin" />
          </div>
        ) : remote && remote.length === 0 ? (
          <p className="rounded-lg bg-[var(--sys-surface)] p-3 text-xs text-[var(--sys-muted-foreground)]">
            لا حملات في هذا الحساب.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(remote ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setChosen(r.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-start transition ${
                  chosen === r.id ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-soft)]' : 'border-[var(--sys-border)] hover:border-[var(--sys-primary)]/40'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-[var(--sys-foreground)]">{r.name}</span>
                  <span className="block font-mono text-xs text-[var(--sys-muted)]" dir="ltr">{r.id}</span>
                </span>
                <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-semibold ${
                  r.status === 'ACTIVE' ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]'
                }`}>
                  {r.status === 'ACTIVE' ? 'تعمل' : 'متوقفة'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={() => save(false)} disabled={busy || !chosen} className="flex-1">
            {busy ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiCheckLine className="h-4 w-4" />}
            اربط
          </Button>
          {campaign.spendSource === 'SYNCED' && (
            <Button variant="outline" onClick={() => save(true)} disabled={busy}>
              فكّ الربط
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </div>

        {campaign.spendSource === 'SYNCED' && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--sys-muted)]">
            فكّ الربط يعيد الإنفاق للإدخال اليدوي، ولا يمسح الرقم المسحوب — هو مصروف حقيقي حدث.
          </p>
        )}
      </div>
    </div>
  );
}
