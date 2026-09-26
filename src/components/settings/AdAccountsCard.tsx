'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Loader2, Trash2, AlertTriangle, Plug, ExternalLink, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';

/**
 * CONNECTING THE PLACES THE SPEND COMES FROM.
 *
 * A campaign's revenue, orders, confirmations and deliveries are all this
 * system's own record. What an advert COST belongs to Meta, TikTok or
 * Snapchat, and until now the seller read it off their Ads Manager and
 * typed it in.
 *
 * This component names none of the three. The platforms, their fields and
 * their instructions come from the server, because only the adapter knows
 * that Snapchat needs three secrets and Meta needs one — and a form built
 * from a hardcoded list is a form that goes stale the day a fourth platform
 * is added.
 *
 * The secrets are write-only: checked against the platform before they are
 * stored, encrypted, and never returned — only the last four characters, so
 * a seller can tell which token is in there.
 */

interface Field {
  key: string;
  label: string;
  secret: boolean;
  placeholder: string;
  hint?: string;
}

interface Platform {
  platform: string;
  label: string;
  short: string;
  fields: Field[];
  help: { url: string; urlLabel: string; steps: string[] };
}

interface Account {
  id: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  tokenHint: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  _count: { campaigns: number };
}

export function AdAccountsCard({ storeName }: { storeName?: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [chosen, setChosen] = useState<string>('META');
  const [accountId, setAccountId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const confirm = useConfirm();

  const active = useMemo(
    () => platforms.find((p) => p.platform === chosen) ?? platforms[0] ?? null,
    [platforms, chosen]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/ad-accounts');
      const json = await res.json();
      setAccounts(json.accounts ?? []);
      setPlatforms(json.platforms ?? []);
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Switching platform clears the fields: one platform's secret is not another's. */
  function pick(p: string) {
    setChosen(p);
    setValues({});
    setAccountId('');
    setMsg(null);
  }

  const ready =
    !!active &&
    accountId.trim().length >= 5 &&
    active.fields.every((f) => (values[f.key] ?? '').trim().length > 0);

  async function connect() {
    if (!active) return;
    setBusy(true);
    setMsg(null);
    try {
      const credentials: Record<string, string> = {};
      for (const f of active.fields) credentials[f.key] = (values[f.key] ?? '').trim();

      const res = await fetch('/api/settings/ad-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: active.platform, accountId: accountId.trim(), credentials }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الربط');
      // Cleared immediately: a secret left in a field is a secret on a
      // screen somebody else can walk past.
      setValues({});
      setAccountId('');
      await load();
      setMsg({
        ok: true,
        text: json.warning || `تم ربط «${json.account.accountName}» — العملة ${json.currency}.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الربط' });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(a: Account) {
    const ok = await confirm({
      title: `فصل «${a.accountName ?? a.accountId}»؟`,
      body: a._count.campaigns
        ? `${a._count.campaigns} حملة ستعود إلى إدخال الإنفاق يدوياً. الأرقام المسحوبة تبقى كما هي — هي مصروف حقيقي.`
        : 'ستُحذف البيانات المحفوظة.',
      confirmLabel: 'افصل',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await fetch(`/api/settings/ad-accounts/${a.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    await load();
    if (json.message) setMsg({ ok: true, text: json.message });
  }

  const labelOf = (p: string) => platforms.find((x) => x.platform === p)?.short ?? p;

  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4" dir="rtl">
      <div className="mb-1 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-[var(--sys-primary)]" />
        <h2 className="text-sm font-bold text-[var(--sys-heading)]">حسابات الإعلانات</h2>
        {storeName && (
          <span className="rounded-lg bg-[var(--sys-surface-strong)] px-1.5 py-0.5 text-caption font-semibold text-[var(--sys-foreground)]">
            متجر {storeName}
          </span>
        )}
      </div>
      <p className="mb-3 text-caption leading-relaxed text-[var(--sys-muted-foreground)]">
        اربط حساباتك الإعلانية ليأتي الإنفاق تلقائياً بدل أن تكتبه. كل شيء آخر في شاشة الحملات
        محسوب من طلباتك أصلاً. الحساب يُربط بالمتجر المختار من الأعلى — بدّل المتجر لتربط حساب متجر آخر.
      </p>

      {accounts === null ? (
        <div className="flex h-16 items-center justify-center text-[var(--sys-muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : accounts.length > 0 ? (
        <div className="mb-3 space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-[var(--sys-border)] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--sys-heading)]">
                    {a.accountName ?? a.accountId}
                    <span className="rounded-lg bg-[var(--sys-surface-strong)] px-1.5 py-0.5 text-caption font-semibold text-[var(--sys-foreground)]">
                      {labelOf(a.platform)}
                    </span>
                    <span
                      className={`rounded-lg px-1.5 py-0.5 text-caption font-semibold ${
                        a.status === 'CONNECTED' ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]'
                      }`}
                    >
                      {a.status === 'CONNECTED' ? 'متصل' : 'يحتاج انتباهاً'}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-caption text-[var(--sys-muted)]" dir="ltr">
                    {a.accountId} · ••••{a.tokenHint ?? ''}
                  </p>
                  <p className="mt-0.5 text-caption text-[var(--sys-muted-foreground)]">
                    {a._count.campaigns} حملة مربوطة
                    {a.lastSyncAt && ` · آخر سحب ${new Date(a.lastSyncAt).toLocaleString('ar')}`}
                  </p>
                </div>
                <button
                  onClick={() => void disconnect(a)}
                  title="فصل"
                  className="rounded-lg p-1 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-destructive-soft)] hover:text-[var(--sys-destructive)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* The platform's own words, not a summary of them. A seller who
                  reads "token has expired" can fix it; one who reads "sync
                  failed" cannot. */}
              {a.status !== 'CONNECTED' && a.lastError && (
                <p className="mt-1.5 flex items-start gap-1 rounded-lg bg-[var(--sys-destructive-soft)] p-1.5 text-caption leading-relaxed text-[var(--sys-destructive)]">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  {a.lastError}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {active && (
        <div className="space-y-2 rounded-lg bg-[var(--sys-surface)] p-3">
          {/* Tabs rather than a dropdown: three platforms fit, and a seller
              should see that TikTok is possible without opening anything. */}
          {platforms.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-[var(--sys-surface-strong)] p-0.5">
              {platforms.map((p) => (
                <button
                  key={p.platform}
                  type="button"
                  onClick={() => pick(p.platform)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-caption font-semibold transition ${
                    p.platform === active.platform
                      ? 'bg-[var(--sys-card)] text-[var(--sys-primary)] shadow-card'
                      : 'text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)]'
                  }`}
                >
                  {p.short}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="mb-1 block text-caption font-semibold text-[var(--sys-foreground)]">رقم الحساب الإعلاني</label>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={ACCOUNT_PLACEHOLDER[active.platform] ?? ''}
              className={INPUT}
              dir="ltr"
            />
          </div>

          {active.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-caption font-semibold text-[var(--sys-foreground)]">{f.label}</label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className={INPUT}
                dir="ltr"
                autoComplete="off"
              />
              {f.hint && <p className="mt-1 text-caption leading-relaxed text-[var(--sys-muted)]">{f.hint}</p>}
            </div>
          ))}

          <p className="text-caption leading-relaxed text-[var(--sys-muted)]">
            تُشفَّر قبل الحفظ ولا تُعرَض بعدها أبداً، ولا تُكتب في سجل التدقيق. نتحقق منها مع{' '}
            {active.short} قبل الحفظ — بيانات تُحفظ بلا تجربة هي بيانات تفشل ليلاً بلا أن ينتبه أحد.
          </p>

          <Button size="sm" onClick={connect} disabled={busy || !ready}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            اربط الحساب
          </Button>

          {msg && (
            <p className={`text-caption font-medium ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{msg.text}</p>
          )}
        </div>
      )}

      {/* The instructions are the feature. "Paste your access token" helps
          somebody who already knows how. They come from the adapter, so each
          platform's steps are its own. */}
      {active && (
        <>
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            className="mt-2 flex items-center gap-1 text-caption font-semibold text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]"
          >
            <ChevronDown className={`h-3 w-3 transition ${howOpen ? 'rotate-180' : ''}`} />
            من أين أحصل على بيانات {active.short}؟
          </button>

          {howOpen && (
            <ol className="mt-2 space-y-2 rounded-lg bg-[var(--sys-surface)] p-3 text-caption leading-relaxed text-[var(--sys-foreground)]">
              <li>
                افتح{' '}
                <a
                  href={active.help.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[var(--sys-info)] hover:underline"
                >
                  {active.help.urlLabel} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </li>
              {active.help.steps.map((s, i) => (
                <li key={i} className="flex gap-1.5">
                  <b className="shrink-0">{ARABIC_INDEX[i] ?? `${i + 1}.`}</b>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

const ARABIC_INDEX = ['١.', '٢.', '٣.', '٤.', '٥.'];

/** Shape of the id, which is the one thing that is not a credential. */
const ACCOUNT_PLACEHOLDER: Record<string, string> = {
  META: 'act_1234567890',
  TIKTOK: '7012345678901234567',
  SNAPCHAT: '00000000-0000-0000-0000-000000000000',
};

const INPUT =
  'w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 py-2 text-sm text-[var(--sys-heading)] outline-none focus:border-[var(--sys-primary)]';
