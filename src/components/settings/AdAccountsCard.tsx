'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Loader2, Check, Trash2, AlertTriangle, Plug, ExternalLink, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';

/**
 * CONNECTING THE PLACE THE SPEND COMES FROM.
 *
 * A campaign's revenue, orders, confirmations and deliveries are all this
 * system's own record. What an advert COST is Meta's, and until now the
 * seller read it off Ads Manager and typed it in.
 *
 * The token is write-only: it is checked against Meta before it is stored,
 * encrypted, and never comes back — only the last four characters, so a
 * seller can tell which token is in there.
 *
 * The instructions matter as much as the form. "Paste your access token" is
 * a sentence that helps somebody who already knows how; the steps below are
 * for somebody who does not, and they are the difference between a feature
 * that is used and one that is admired.
 */

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

export function AdAccountsCard() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/ad-accounts');
      const json = await res.json();
      setAccounts(json.accounts ?? []);
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/ad-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'META', accountId: accountId.trim(), token: token.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الربط');
      // Cleared immediately: a token left in a field is a token on a screen
      // somebody else can walk past.
      setToken('');
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
        : 'سيُحذف الرمز المحفوظ.',
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

  return (
    <div className="rounded-xl border border-[#e3e8ef] bg-white p-4" dir="rtl">
      <div className="mb-1 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-[#b8256e]" />
        <h2 className="text-sm font-bold text-[#121926]">حسابات الإعلانات</h2>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[#697586]">
        اربط حسابك الإعلاني ليأتي الإنفاق تلقائياً بدل أن تكتبه. كل شيء آخر في شاشة الحملات
        محسوب من طلباتك أصلاً.
      </p>

      {accounts === null ? (
        <div className="flex h-16 items-center justify-center text-[#697586]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : accounts.length > 0 ? (
        <div className="mb-3 space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-[#e3e8ef] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[#121926]">
                    {a.accountName ?? a.accountId}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        a.status === 'CONNECTED' ? 'bg-[#e6f9ee] text-[#00994d]' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {a.status === 'CONNECTED' ? 'متصل' : 'يحتاج انتباهاً'}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#9aa4b2]" dir="ltr">
                    {a.accountId} · ••••{a.tokenHint ?? ''}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#697586]">
                    {a._count.campaigns} حملة مربوطة
                    {a.lastSyncAt && ` · آخر سحب ${new Date(a.lastSyncAt).toLocaleString('ar')}`}
                  </p>
                </div>
                <button
                  onClick={() => void disconnect(a)}
                  title="فصل"
                  className="rounded p-1 text-[#697586] hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Meta's own words, not a summary of them. A seller who reads
                  "token has expired" can fix it; one who reads "sync failed"
                  cannot. */}
              {a.status !== 'CONNECTED' && a.lastError && (
                <p className="mt-1.5 flex items-start gap-1 rounded bg-rose-50 p-1.5 text-[10px] leading-relaxed text-rose-700">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  {a.lastError}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg bg-[#f8fafc] p-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[#364152]">رقم الحساب الإعلاني</label>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="act_1234567890"
            className={INPUT}
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[#364152]">رمز الوصول</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="EAAG..."
            className={INPUT}
            dir="ltr"
            autoComplete="off"
          />
          <p className="mt-1 text-[10px] leading-relaxed text-[#9aa4b2]">
            يُشفَّر قبل الحفظ ولا يُعرَض بعدها أبداً، ولا يُكتب في سجل التدقيق. نتحقق منه مع ميتا
            قبل حفظه — رمز يُحفظ بلا تجربة هو رمز يفشل ليلاً بلا أن ينتبه أحد.
          </p>
        </div>

        <Button
          size="sm"
          onClick={connect}
          disabled={busy || accountId.trim().length < 5 || token.trim().length < 20}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          اربط الحساب
        </Button>

        {msg && (
          <p className={`text-[11px] font-medium ${msg.ok ? 'text-[#00994d]' : 'text-rose-600'}`}>{msg.text}</p>
        )}
      </div>

      {/* The instructions are the feature. "Paste your access token" helps
          somebody who already knows how. */}
      <button
        type="button"
        onClick={() => setHowOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#697586] hover:text-[#b8256e]"
      >
        <ChevronDown className={`h-3 w-3 transition ${howOpen ? 'rotate-180' : ''}`} />
        من أين أحصل على الرمز؟
      </button>

      {howOpen && (
        <ol className="mt-2 space-y-2 rounded-lg bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[#364152]">
          <li>
            <b>١.</b> افتح{' '}
            <a
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[#0ea5e9] hover:underline"
            >
              مدير الأعمال ← مستخدمو النظام <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </li>
          <li>
            <b>٢.</b> أنشئ مستخدم نظام بدور <b>Admin</b>، ثم <b>Assign Assets</b> وعيّن حسابك
            الإعلاني عليه بصلاحية <b>Manage campaigns</b>.
          </li>
          <li>
            <b>٣.</b> اضغط <b>Generate New Token</b>، اختر تطبيقك، وفعّل صلاحية{' '}
            <code className="rounded bg-white px-1 font-mono text-[10px]">ads_read</code> وحدها —
            لا نحتاج أكثر منها ولا نطلبه.
          </li>
          <li>
            <b>٤.</b> انسخ الرمز والصقه أعلاه. رمز مستخدم النظام لا تنتهي صلاحيته كرموز
            المستخدم العادية، فلن تضطر لتجديده كل شهرين.
          </li>
          <li className="border-t border-[#e3e8ef] pt-2 text-[#697586]">
            رقم الحساب تجده في مدير الإعلانات أعلى الصفحة، أو في الرابط بعد{' '}
            <code className="rounded bg-white px-1 font-mono text-[10px]">act=</code>. الصقه بالرقم
            وحده أو مع البادئة — كلاهما يعمل.
          </li>
        </ol>
      )}
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-[#e3e8ef] bg-white px-3 py-2 text-sm text-[#121926] outline-none focus:border-[#b8256e]';
