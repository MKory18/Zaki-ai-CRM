'use client';

import { AssistantsTable } from '@/components/screens/ai/AssistantsTable';
import { MessageTemplatesCard } from '@/components/settings/MessageTemplatesCard';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Check, ChevronDown, KeyRound, Loader2, Plug, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MAX_PROMPT, missingSlots, type AiJob, type PromptVersion } from '@/lib/ai-prompts';

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
  /** What each job's prompt said before, newest first. */
  promptHistory?: Record<string, PromptVersion[]>;
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
      <div className="flex h-40 items-center justify-center text-[var(--sys-muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const provider = providers.find((p) => p.id === settings.provider);

  return (
    <div className="max-w-3xl space-y-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--sys-heading)]">
          <Bot className="h-5 w-5 text-[var(--sys-primary)]" /> الذكاء الاصطناعي والنصوص
        </h1>
        <p className="mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
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
          ['prompts', 'النصوص والقوالب'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`h-10 flex-1 rounded-lg border text-xs font-medium ${
              tab === value ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]' : 'border-[var(--sys-border)] text-[var(--sys-foreground)]'
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
      <section className={`rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 ${tab === 'provider' ? '' : 'hidden'}`}>
        <h2 className="mb-3 text-sm font-bold text-[var(--sys-heading)]">المزوّد والنموذج</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--sys-foreground)]">المزوّد</label>
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
            <label className="mb-1 block text-xs font-semibold text-[var(--sys-foreground)]">النموذج</label>
            <input
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className={INPUT}
              dir="ltr"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--sys-foreground)]">
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
          <p className="mt-1 text-xs leading-relaxed text-[var(--sys-muted)]">
            {provider?.keyHelp}
            {' — '}
            المفتاح يُشفَّر ولا يُعرَض بعدها أبداً، ولا يُكتب في سجل التدقيق.
          </p>
        </div>

        {/* A key is pasted and saved, and nothing says whether it works —
            the assistant just quietly stops being an assistant. This asks
            the provider one cheap question and repeats what came back. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--sys-border)] pt-3">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing || !settings.hasKey}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-3 text-xs font-semibold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            اختبار الاتصال
          </button>
          {!settings.hasKey && <span className="text-xs text-[var(--sys-muted)]">احفظ المفتاح أولاً.</span>}
          {test && (
            <span className={`text-xs ${test.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{test.text}</span>
          )}
        </div>
      </section>

      {/* ── the words ── */}
      <section className={`rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 ${tab === 'prompts' ? '' : 'hidden'}`}>
        <h2 className="text-sm font-bold text-[var(--sys-heading)]">النصوص</h2>
        <p className="mb-3 mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
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
              <div key={job.key} className="rounded-lg border border-[var(--sys-border)]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : job.key)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-start"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[var(--sys-foreground)]">{job.label}</span>
                      {overridden && (
                        <span className="rounded-lg bg-[var(--sys-primary-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--sys-primary)]">
                          معدّل
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--sys-muted)]">{job.where}</span>
                  </span>
                  <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sys-muted)] transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--sys-surface-strong)] p-3">
                    <p className="mb-2 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{job.note}</p>

                    {job.slots.length > 0 && (
                      <p className="mb-2 text-xs text-[var(--sys-muted-foreground)]">
                        يستبدل النظام:{' '}
                        {job.slots.map((s) => (
                          <code key={s} className="mx-0.5 rounded-lg bg-[var(--sys-surface-strong)] px-1 font-mono text-xs">{s}</code>
                        ))}
                      </p>
                    )}

                    <textarea
                      value={value}
                      onChange={(e) => setDrafts({ ...drafts, [job.key]: e.target.value.slice(0, MAX_PROMPT) })}
                      rows={8}
                      placeholder={job.default || 'لا نصّ افتراضي لهذه الوظيفة — اكتب تعليماتك.'}
                      className="w-full rounded-lg border border-[var(--sys-border)] p-2 font-mono text-xs leading-relaxed text-[var(--sys-heading)] outline-none focus:border-[var(--sys-primary)]"
                    />

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-[var(--sys-muted)]">{value.length} / {MAX_PROMPT}</span>
                      {overridden && (
                        <button
                          type="button"
                          onClick={() => setDrafts({ ...drafts, [job.key]: '' })}
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]"
                        >
                          <RotateCcw className="h-3 w-3" /> أعد النص الأصلي
                        </button>
                      )}
                    </div>

                    {/* What it said before. A prompt is the one setting where
                        a good change and a ruinous one look identical in the
                        box, and the wording that worked is otherwise gone. */}
                    {(settings.promptHistory?.[job.key]?.length ?? 0) > 0 && (
                      <details className="mt-2 rounded-lg border border-[var(--sys-border)]">
                        <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-[var(--sys-muted-foreground)]">
                          النسخ السابقة ({settings.promptHistory![job.key].length})
                        </summary>
                        <ul className="divide-y divide-[var(--sys-surface-strong)] border-t border-[var(--sys-surface-strong)]">
                          {settings.promptHistory![job.key].map((v, n) => (
                            <li key={n} className="px-2 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[var(--sys-muted)]">
                                  <span dir="ltr" className="tabular-nums">{v.at.slice(0, 16).replace('T', ' ')}</span>
                                  {v.by && <span> · {v.by}</span>}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setDrafts({ ...drafts, [job.key]: v.text })}
                                  className="flex items-center gap-1 text-xs font-semibold text-[var(--sys-primary)]"
                                >
                                  <RotateCcw className="h-3 w-3" /> استرجع
                                </button>
                              </div>
                              {/* Restoring puts it in the box; the save button
                                  is still the one that commits it. */}
                              <p className="mt-1 line-clamp-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
                                {v.text || 'النص الأصلي (بلا تعديل)'}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {/* Not an error — a seller may well want a prompt that
                        ignores the context — but said out loud, because a
                        summary prompt with no {context} summarises nothing
                        and fails silently otherwise. */}
                    {missing.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1 rounded-lg bg-[var(--sys-warning-soft)] p-1.5 text-xs leading-relaxed text-[var(--sys-warning)]">
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

      {/* The words said to a CUSTOMER, on the same tab as the words said to
          the model — they are the same job of work, and a seller fixing how
          the shop speaks should not have to remember which of two screens
          holds which half of it. Its own save button, because these are
          stored apart and one form saving both would be a form where half
          of it silently did nothing. */}
      <section className={`rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 ${tab === 'prompts' ? '' : 'hidden'}`}>
        <h2 className="mb-3 text-sm font-bold text-[var(--sys-heading)]">قوالب رسائل الزبائن</h2>
        <MessageTemplatesCard />
      </section>

      <div className={`items-center gap-2 ${tab === 'assistants' ? 'hidden' : 'flex'}`}>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          احفظ الإعدادات والنصوص
        </Button>
        {msg && (
          <span className={`text-xs font-medium ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 py-2 text-sm text-[var(--sys-heading)] outline-none focus:border-[var(--sys-primary)]';
