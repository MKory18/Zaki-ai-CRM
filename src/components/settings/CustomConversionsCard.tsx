'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Target, Loader2, Trash2, AlertTriangle, Plug, ChevronDown, Plus, Check, KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';

/**
 * THE CONVERSIONS THE SELLER DECIDES ON.
 *
 * The pixel on this page fires when a form is submitted. For a shop that is
 * paid at the door that is not a sale — it is somebody who typed their
 * phone number, and a large share of them never pay. Optimising on it
 * teaches Meta to find people who fill in forms.
 *
 * This is the other half: events our own server sends, at a moment in the
 * order that the seller picks, under a name of their own. The browser pixel
 * is not touched and keeps doing exactly what it did.
 *
 * The screen shows counts and a match quality, and it has to, because this
 * feature's one failure mode is silent: events that stopped arriving look
 * exactly like a quiet week, and events matching nobody look exactly like
 * events that worked.
 */

interface Pixel {
  id: string;
  platform: string;
  name: string;
  pixelId: string;
  capiTokenHint: string | null;
  capiTestCode: string | null;
}

interface Conversion {
  id: string;
  name: string;
  eventName: string;
  trigger: string;
  valueSource: string;
  enabled: boolean;
  pixel: { id: string; name: string; pixelId: string; capiTokenHint: string | null };
  stats: { sent: number; pending: number; failed: number; skipped: number; matchQuality: number | null };
}

interface Options {
  triggers: { value: string; label: string; hint: string; suggested: string }[];
  valueSources: { value: string; label: string }[];
}

export function CustomConversionsCard() {
  const [pixels, setPixels] = useState<Pixel[] | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [token, setToken] = useState('');
  /** null = untouched, so the server's value shows through without an effect to copy it. */
  const [testCodeEdit, setTestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', eventName: '', trigger: '', valueSource: 'ORDER_TOTAL' });
  const [howOpen, setHowOpen] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/settings/tracking-pixels'),
        fetch('/api/settings/conversions'),
      ]);
      const p = await pRes.json();
      const c = await cRes.json();
      // Only Meta speaks this API today. Offering the others would be a
      // connection that looks made and sends nothing.
      const meta = (p.pixels ?? []).filter((x: Pixel) => x.platform === 'META');
      setPixels(meta);
      setConversions(c.conversions ?? []);
      setOptions(c.options ?? null);
      setPixelId((cur) => cur || meta[0]?.id || '');
    } catch {
      setPixels([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pixel = useMemo(() => pixels?.find((p) => p.id === pixelId) ?? null, [pixels, pixelId]);
  const connected = !!pixel?.capiTokenHint;

  const testCode = testCodeEdit ?? pixel?.capiTestCode ?? '';

  /** Choosing a moment fills in a sensible event name, which most sellers keep. */
  function pickTrigger(value: string) {
    const t = options?.triggers.find((x) => x.value === value);
    setForm((f) => ({
      ...f,
      trigger: value,
      eventName: f.eventName && f.eventName !== t?.suggested ? f.eventName : (t?.suggested ?? ''),
      name: f.name || t?.label || '',
      // At delivery the collected amount is the truth; before it there is
      // nothing collected to report.
      valueSource: value === 'order.delivered' ? 'COLLECTED_AMOUNT' : 'ORDER_TOTAL',
    }));
  }

  async function saveToken() {
    if (!pixel) return;
    setBusy('token');
    setMsg(null);
    try {
      const res = await fetch(`/api/settings/tracking-pixels/${pixel.id}/capi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الحفظ');
      // Cleared immediately: a token left in a field is a token on a screen
      // somebody else can walk past.
      setToken('');
      await load();
      setMsg({ ok: true, text: `تم الربط بـ «${json.metaName}».` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الحفظ' });
    } finally {
      setBusy(null);
    }
  }

  async function saveTestCode() {
    if (!pixel) return;
    setBusy('test');
    try {
      await fetch(`/api/settings/tracking-pixels/${pixel.id}/capi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCode: testCode.trim() }),
      });
      setTestCode(null);
      await load();
      setMsg({
        ok: true,
        text: testCode.trim()
          ? 'وضع الاختبار مفعّل — الأحداث تظهر في Test Events ولا تُحتسب تحويلات. امسح الرمز حين تنتهي.'
          : 'أُوقف وضع الاختبار. الأحداث تُحتسب الآن.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function removeToken() {
    if (!pixel) return;
    const ok = await confirm({
      title: `فصل واجهة التحويلات عن «${pixel.name}»؟`,
      body: 'التحويلات المعرَّفة تبقى كما هي، لكنها تتوقف عن الإرسال حتى تضيف رمزاً جديداً.',
      confirmLabel: 'افصل',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    });
    if (!ok) return;
    await fetch(`/api/settings/tracking-pixels/${pixel.id}/capi`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove: true }),
    });
    await load();
  }

  async function create() {
    setBusy('create');
    setMsg(null);
    try {
      const res = await fetch('/api/settings/conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixelId, ...form }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الإنشاء');
      setForm({ name: '', eventName: '', trigger: '', valueSource: 'ORDER_TOTAL' });
      setAdding(false);
      await load();
      setMsg({ ok: !json.warning, text: json.warning || 'أُضيف التحويل.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الإنشاء' });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(c: Conversion) {
    await fetch(`/api/settings/conversions/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    await load();
  }

  async function remove(c: Conversion) {
    const total = c.stats.sent + c.stats.pending;
    const ok = await confirm({
      title: `حذف «${c.name}»؟`,
      body: total
        ? `سيُحذف سجلّ ${total} إرسالاً معه. الأحداث التي وصلت ميتا تبقى عندهم — إيقافه بدل حذفه يحفظ السجلّ.`
        : 'لم يُرسَل منه شيء بعد.',
      confirmLabel: 'احذف',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await fetch(`/api/settings/conversions/${c.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    await load();
    if (json.message) setMsg({ ok: true, text: json.message });
  }

  const ready = !!form.trigger && form.name.trim().length >= 2 && form.eventName.trim().length >= 3;
  const labelOf = (t: string) => options?.triggers.find((x) => x.value === t)?.label ?? t;

  return (
    <div className="rounded-xl border border-[#e3e8ef] bg-white p-4" dir="rtl">
      <div className="mb-1 flex items-center gap-2">
        <Target className="h-4 w-4 text-[#b8256e]" />
        <h2 className="text-sm font-bold text-[#121926]">التحويلات المخصّصة</h2>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[#697586]">
        البكسل أعلاه يُطلق حدثه لحظة تعبئة النموذج. هنا تختار أنت لحظة أخرى من رحلة الطلب — التأكيد
        أو الاستلام — ويرسلها خادمنا إلى ميتا باسم حدث خاصّ بها. البكسل لا يتغيّر، ولا ازدواج في العدّ.
      </p>

      {pixels === null ? (
        <div className="flex h-16 items-center justify-center text-[#697586]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : pixels.length === 0 ? (
        <p className="rounded-lg bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[#697586]">
          أضف بكسل ميتا أعلاه أولاً — التحويل يُرسَل إلى بكسل بعينه.
        </p>
      ) : (
        <>
          {/* Which pixel. One shop can run more than one. */}
          {pixels.length > 1 && (
            <select
              value={pixelId}
              onChange={(e) => { setPixelId(e.target.value); setTestCode(null); }}
              className={`${INPUT} mb-2`}
            >
              {pixels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.pixelId}
                </option>
              ))}
            </select>
          )}

          {/* ── The token. Nothing sends without it. ── */}
          <div className="mb-3 rounded-lg bg-[#f8fafc] p-3">
            {connected ? (
              <>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#00994d]">
                  <Check className="h-3.5 w-3.5" />
                  واجهة التحويلات مربوطة
                  <span className="font-mono text-[10px] text-[#9aa4b2]" dir="ltr">••••{pixel?.capiTokenHint}</span>
                  <button
                    onClick={() => void removeToken()}
                    className="mr-auto rounded p-1 text-[#697586] hover:bg-rose-50 hover:text-rose-600"
                    title="فصل"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </p>
                <div className="mt-2">
                  <label className="mb-1 block text-[11px] font-semibold text-[#364152]">
                    رمز الاختبار (اختياري)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={testCode}
                      onChange={(e) => setTestCode(e.target.value)}
                      placeholder="TEST12345"
                      className={INPUT}
                      dir="ltr"
                    />
                    <Button size="sm" variant="outline" onClick={saveTestCode} disabled={busy === 'test'}>
                      حفظ
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#9aa4b2]">
                    من Events Manager ← Test Events. حين يكون موجوداً تظهر الأحداث في لوحة الاختبار
                    و<b>لا تُحتسب تحويلات</b> — فامسحه حين تنتهي، وإلا رأيت أحداثاً تصل بلا تحويلات أبداً.
                  </p>
                </div>
              </>
            ) : (
              <>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#364152]">
                  <KeyRound className="h-3.5 w-3.5 text-[#b8256e]" />
                  رمز واجهة التحويلات
                </label>
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
                  قبل حفظه — الخلل هنا لا يظهر إلا بعد أيام داخل عامل لا يراقبه أحد.
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={saveToken}
                  disabled={busy === 'token' || token.trim().length < 20}
                >
                  {busy === 'token' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                  اربط
                </Button>
              </>
            )}
          </div>

          {/* ── What is defined, and whether it is actually working ── */}
          {conversions.filter((c) => c.pixel.id === pixelId).length > 0 && (
            <div className="mb-3 space-y-2">
              {conversions
                .filter((c) => c.pixel.id === pixelId)
                .map((c) => (
                  <div key={c.id} className="rounded-lg border border-[#e3e8ef] p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#121926]">
                          {c.name}
                          <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[9px] text-[#475467]" dir="ltr">
                            {c.eventName}
                          </span>
                          {!c.enabled && (
                            <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[9px] font-semibold text-[#697586]">
                              موقوف
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#697586]">
                          عند: {labelOf(c.trigger)} ·{' '}
                          {options?.valueSources.find((v) => v.value === c.valueSource)?.label}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-[#697586]">
                          <span>أُرسل <b className="text-[#00994d]">{c.stats.sent}</b></span>
                          {c.stats.pending > 0 && <span>بالانتظار {c.stats.pending}</span>}
                          {c.stats.failed > 0 && <span className="text-rose-600">فشل {c.stats.failed}</span>}
                          {c.stats.skipped > 0 && <span className="text-amber-600">متأخّر {c.stats.skipped}</span>}
                          {c.stats.matchQuality !== null && (
                            /* The only way anybody finds out that events are
                               arriving and matching nobody. */
                            <span className={c.stats.matchQuality < 0.4 ? 'text-amber-600' : ''}>
                              جودة المطابقة {Math.round(c.stats.matchQuality * 100)}%
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => void toggle(c)}
                          className="rounded px-2 py-1 text-[10px] font-semibold text-[#697586] hover:bg-[#f8fafc]"
                        >
                          {c.enabled ? 'أوقف' : 'شغّل'}
                        </button>
                        <button
                          onClick={() => void remove(c)}
                          title="حذف"
                          className="rounded p-1 text-[#697586] hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {c.stats.matchQuality !== null && c.stats.matchQuality < 0.4 && (
                      <p className="mt-1.5 flex items-start gap-1 rounded bg-amber-50 p-1.5 text-[10px] leading-relaxed text-amber-800">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        جودة المطابقة منخفضة — الأحداث تصل لكن ميتا تربط قليلاً منها بأشخاص. تحقّق أن
                        أرقام الهواتف مخزّنة كاملة.
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* ── Add one ── */}
          {!adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="w-full gap-1.5">
              <Plus className="h-3.5 w-3.5 text-[#b8256e]" />
              أضف تحويلاً
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg bg-[#f8fafc] p-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-[#364152]">
                  متى يُحتسب التحويل؟
                </label>
                <div className="space-y-1.5">
                  {options?.triggers.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => pickTrigger(t.value)}
                      className={`w-full rounded-lg border p-2 text-right transition ${
                        form.trigger === t.value
                          ? 'border-[#b8256e] bg-white'
                          : 'border-[#e3e8ef] bg-white hover:border-[#cdd5df]'
                      }`}
                    >
                      <span className="block text-[11px] font-bold text-[#121926]">{t.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-[#697586]">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {form.trigger && (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#364152]">الاسم عندك</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={INPUT}
                      placeholder="شراء موصَّل"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#364152]">
                      اسم الحدث في ميتا
                    </label>
                    <input
                      value={form.eventName}
                      onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                      className={INPUT}
                      dir="ltr"
                      placeholder="OrderDelivered"
                    />
                    <p className="mt-1 text-[10px] leading-relaxed text-[#9aa4b2]">
                      حروف إنجليزية وأرقام وشرطة سفلية فقط. من هذا الاسم تبني التحويل المخصّص في مدير
                      الأحداث. لا تستخدم <code className="font-mono">Purchase</code> — البكسل يرسله أصلاً
                      وسيتضاعف العدّ.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#364152]">القيمة المرسَلة</label>
                    <select
                      value={form.valueSource}
                      onChange={(e) => setForm({ ...form, valueSource: e.target.value })}
                      className={INPUT}
                    >
                      {options?.valueSources.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={create} disabled={busy === 'create' || !ready}>
                      {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      أضف
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                      إلغاء
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {msg && (
            <p className={`mt-2 text-[11px] font-medium leading-relaxed ${msg.ok ? 'text-[#00994d]' : 'text-rose-600'}`}>
              {msg.text}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setHowOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#697586] hover:text-[#b8256e]"
      >
        <ChevronDown className={`h-3 w-3 transition ${howOpen ? 'rotate-180' : ''}`} />
        كيف أُشغّلها؟
      </button>

      {howOpen && (
        <ol className="mt-2 space-y-2 rounded-lg bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-[#364152]">
          <li>
            <b>١.</b> في{' '}
            <a
              href="https://business.facebook.com/events_manager2"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0ea5e9] hover:underline"
            >
              مدير الأحداث
            </a>{' '}
            اختر بكسلك ← <b>Settings</b> ← <b>Conversions API</b> ← <b>Generate access token</b>، والصقه أعلاه.
          </li>
          <li>
            <b>٢.</b> أضف تحويلاً هنا واختر اللحظة. الاسم الذي تكتبه هو ما ستراه ميتا.
          </li>
          <li>
            <b>٣.</b> بعد أوّل طلب يصل تلك اللحظة، سترى الحدث في مدير الأحداث باسمه.
          </li>
          <li>
            <b>٤.</b> ثمّ <b>Custom Conversions ← Create</b>، واختر حدثك اسماً للتحويل المخصّص. هناك
            تضيف شروط الرابط أو النطاق إن أردت — هذا مكانها، لا هنا.
          </li>
          <li className="border-t border-[#e3e8ef] pt-2 text-[#697586]">
            ميتا ترفض حدثاً أقدم من <b>٧ أيام</b>. طلب تأخّر تسليمه أكثر من ذلك يُسجَّل «متأخّر» ولا يُرسَل —
            ليس خللاً، بل حدود نافذة الإسناد عندهم.
          </li>
        </ol>
      )}
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-[#e3e8ef] bg-white px-3 py-2 text-sm text-[#121926] outline-none focus:border-[#b8256e]';
