'use client';

import { AssistantsTable } from '@/components/screens/ai/AssistantsTable';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Check, ChevronDown, KeyRound, Loader2, Plug, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MAX_PROMPT, missingSlots, type AiJob } from '@/lib/ai-prompts';

/**
 * THE AI, AND EVERY WORD THE SYSTEM SAYS TO IT.
 *
 * It lived as one card at the bottom of system settings — a provider, a
 * model and a key — while the actual instructions were written into the
 * files that send them. The person who knows whether "be concise" suits
 * their business, in their dialect, for their customers, could not change
 * a syllable of it.
 *
 * So: its own screen, and every job's prompt beside its default. The
 * default is shown because a seller editing a prompt needs to see what
 * they are replacing, and because a prompt they have broken must be one
 * click from working again.
 *
 * Only OVERRIDES are stored. A prompt equal to the default is not an
 * override, and a cleared box means "go back to normal" — a company that
 * never touched a prompt gets this year's wording and not the one they
 * were created with.
 */

interface Provider { id: string; label: string; defaultModel: string; models: string[]; keyHelp: string }
interface Settings {
  /** What the business-intelligence assistant may read. */
  intelligenceScopes?: string[];
  provider: string;
  model: string;
  prompt: string;
  prompts: Record<string, string>;
  hasKey: boolean;
  keyHint: string | null;
}

export function AiSettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'provider' | 'assistants' | 'prompts'>('provider');
  /** The provider's own answer to one cheap question — not a green tick. */
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  async function testConnection() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/settings/ai/test', { method: 'POST', credentials: 'same-origin' });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reply?: string; model?: string };
      setTest(
        r.ok
          ? { ok: true, text: `المزوّد ردّ${r.reply ? `: «${r.reply}»` : ''} — ${r.model ?? ''}` }
          : { ok: false, text: r.error ?? 'تعذّر الاتصال' }
      );
    } catch (e) {
      setTest({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الاتصال' });
    } finally {
      setTesting(false);
    }
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/settings/ai');
    const json = await res.json();
    setSettings(json.settings);
    setProviders(json.providers || []);
    setJobs(json.jobs || []);
    setDrafts(json.settings?.prompts ?? {});
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model,
          prompts: drafts,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الحفظ');
      setApiKey('');
      await load();
      setMsg({ ok: true, text: 'حُفظ. النصوص الجديدة مستعملة من الآن في كل طلب.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex h-40 items-center justify-center text-[#697586]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const provider = providers.find((p) => p.id === settings.provider);

  return (
    <div className="max-w-3xl space-y-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
          <Bot className="h-5 w-5 text-[#b8256e]" /> الذكاء الاصطناعي والنصوص
        </h1>
        <p className="mt-0.5 text-xs text-[#697586]">
          أي نموذج تستعمل، وبأي كلمات يخاطبه النظام.
        </p>
      </div>

      {/* Three questions, three places: which model, who may read what, and
          in whose words. They were one long scroll, so the assistants — the
          part that decides what leaves the company — had nowhere to live. */}
      <div className="flex gap-1.5">
        {([
          ['provider', 'المزوّد والمفتاح'],
          ['assistants', 'المساعدون'],
          ['prompts', 'النصوص'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`h-9 flex-1 rounded-[8px] border text-xs font-medium ${
              tab === value ? 'border-[#b8256e] bg-[#fdf2f8] text-[#b8256e]' : 'border-[#e3e8ef] text-[#364152]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'assistants' && (
        <AssistantsTable
          enabled={settings.intelligenceScopes ?? []}
          onSaved={(scopes) => setSettings({ ...settings, intelligenceScopes: scopes })}
        />
      )}

      {/* ── the vendor ── */}
      <section className={`rounded-xl border border-[#e3e8ef] bg-white p-4 ${tab === 'provider' ? '' : 'hidden'}`}>
        <h2 className="mb-3 text-sm font-bold text-[#121926]">المزوّد والنموذج</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#364152]">المزوّد</label>
            <select
              value={settings.provider}
              onChange={(e) => {
                const p = providers.find((x) => x.id === e.target.value);
                setSettings({ ...settings, provider: e.target.value, model: p?.defaultModel ?? settings.model });
              }}
              className={INPUT}
            >
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#364152]">النموذج</label>
            <input
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className={INPUT}
              dir="ltr"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[#364152]">
            <KeyRound className="h-3 w-3" /> مفتاح الوصول
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasKey ? `محفوظ — ينتهي بـ ${settings.keyHint ?? '••••'}` : 'الصق المفتاح هنا'}
            className={INPUT}
            dir="ltr"
            autoComplete="off"
          />
          <p className="mt-1 text-[10px] leading-relaxed text-[#9aa4b2]">
            {provider?.keyHelp}
            {' — '}
            المفتاح يُشفَّر ولا يُعرَض بعدها أبداً، ولا يُكتب في سجل التدقيق.
          </p>
        </div>

        {/* A key is pasted and saved, and nothing says whether it works —
            the assistant just quietly stops being an assistant. This asks
            the provider one cheap question and repeats what came back. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e3e8ef] pt-3">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing || !settings.hasKey}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e3e8ef] px-3 text-[11px] font-semibold text-[#364152] hover:border-[#b8256e] disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            اختبار الاتصال
          </button>
          {!settings.hasKey && <span className="text-[11px] text-[#9aa4b2]">احفظ المفتاح أولاً.</span>}
          {test && (
            <span className={`text-[11px] ${test.ok ? 'text-[#00a651]' : 'text-[#fb323f]'}`}>{test.text}</span>
          )}
        </div>
      </section>

      {/* ── the words ── */}
      <section className={`rounded-xl border border-[#e3e8ef] bg-white p-4 ${tab === 'prompts' ? '' : 'hidden'}`}>
        <h2 className="text-sm font-bold text-[#121926]">النصوص</h2>
        <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-[#697586]">
          كل وظيفة ونصّها. اترك الحقل فارغاً ليعود النص الأصلي — لا يُحفَظ إلا ما غيّرته أنت،
          فتبقى الوظائف التي لم تلمسها على أحدث صياغة.
        </p>

        <div className="space-y-2">
          {jobs.map((job) => {
            const value = drafts[job.key] ?? '';
            const overridden = Boolean(value.trim()) && value.trim() !== job.default.trim();
            const isOpen = open === job.key;
            const missing = overridden ? missingSlots(job.key, value) : [];
            return (
              <div key={job.key} className="rounded-lg border border-[#e3e8ef]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : job.key)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-start"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#364152]">{job.label}</span>
                      {overridden && (
                        <span className="rounded bg-[#fdf2f7] px-1.5 py-0.5 text-[9px] font-semibold text-[#b8256e]">
                          معدّل
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[#9aa4b2]">{job.where}</span>
                  </span>
                  <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9aa4b2] transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-[#f1f3f6] p-3">
                    <p className="mb-2 text-[10px] leading-relaxed text-[#697586]">{job.note}</p>

                    {job.slots.length > 0 && (
                      <p className="mb-2 text-[10px] text-[#697586]">
                        يستبدل النظام:{' '}
                        {job.slots.map((s) => (
                          <code key={s} className="mx-0.5 rounded bg-[#f1f3f6] px-1 font-mono text-[9px]">{s}</code>
                        ))}
                      </p>
                    )}

                    <textarea
                      value={value}
                      onChange={(e) => setDrafts({ ...drafts, [job.key]: e.target.value.slice(0, MAX_PROMPT) })}
                      rows={8}
                      placeholder={job.default || 'لا نصّ افتراضي لهذه الوظيفة — اكتب تعليماتك.'}
                      className="w-full rounded-lg border border-[#e3e8ef] p-2 font-mono text-[11px] leading-relaxed text-[#121926] outline-none focus:border-[#b8256e]"
                    />

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[9px] text-[#9aa4b2]">{value.length} / {MAX_PROMPT}</span>
                      {overridden && (
                        <button
                          type="button"
                          onClick={() => setDrafts({ ...drafts, [job.key]: '' })}
                          className="flex items-center gap-1 text-[10px] font-semibold text-[#697586] hover:text-[#b8256e]"
                        >
                          <RotateCcw className="h-3 w-3" /> أعد النص الأصلي
                        </button>
                      )}
                    </div>

                    {/* Not an error — a seller may well want a prompt that
                        ignores the context — but said out loud, because a
                        summary prompt with no {context} summarises nothing
                        and fails silently otherwise. */}
                    {missing.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1 rounded bg-amber-50 p-1.5 text-[10px] leading-relaxed text-amber-800">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        <span>
                          نصّك لا يحتوي {missing.join('، ')} — لن تصل الأرقام إلى النموذج، وسيجيب من
                          عنده. أضفها حيث تريد أن تُدرَج.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          احفظ
        </Button>
        {msg && (
          <span className={`text-xs font-medium ${msg.ok ? 'text-[#00994d]' : 'text-rose-600'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-[#e3e8ef] bg-white px-3 py-2 text-sm text-[#121926] outline-none focus:border-[#b8256e]';
