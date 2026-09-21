'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Brain, Check, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';

/**
 * WHICH AI THE COMPANY USES, AND WITH WHOSE KEY.
 *
 * It used to be one environment variable pointing at one vendor — a
 * decision made once at deploy time by whoever had shell access. The
 * company pays for the key, so the company chooses.
 *
 * The key box is empty on every load, and that is not a bug: the stored key
 * is never sent back to the browser. What comes back is whether there IS
 * one and its last characters, which is enough to tell two keys apart and
 * useless to anybody who steals the page.
 */

interface Provider {
  id: string;
  label: string;
  defaultModel: string;
  models: string[];
  keyHelp: string;
}

interface Settings {
  provider: string;
  model: string;
  prompt: string;
  hasKey: boolean;
  keyHint: string | null;
}

const INPUT =
  'w-full h-9 px-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]';

export function AiSettingsCard() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [s, setS] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ settings: Settings; providers: Provider[] }>('/api/settings/ai');
      setProviders(d.providers);
      setS(d.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!s) return null;
  const current = providers.find((p) => p.id === s.provider) ?? providers[0];

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const d = await apiJson<{ settings: Settings }>('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: s.provider,
          model: s.model,
          prompt: s.prompt,
          // Omitted entirely when untouched, so saving a model never wipes
          // the key.
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      setS(d.settings);
      setApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="الذكاء الاصطناعي"
        subtitle="اختر المزوّد والنموذج، وأدخل مفتاحك — يُحفظ مشفّراً ولا يُعرض بعدها"
      />
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[11px] text-[#697586] mb-1">المزوّد</span>
            <select
              value={s.provider}
              onChange={(e) => {
                const p = providers.find((x) => x.id === e.target.value);
                // Switching vendor carries the old vendor's model name over,
                // which is always wrong — reset it to that vendor's default.
                setS({ ...s, provider: e.target.value, model: p?.defaultModel ?? s.model });
              }}
              className={INPUT}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[11px] text-[#697586] mb-1">اسم النموذج</span>
            <input
              value={s.model}
              onChange={(e) => setS({ ...s, model: e.target.value })}
              list="ai-models"
              dir="ltr"
              className={INPUT}
            />
            <datalist id="ai-models">
              {(current?.models ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="block">
          <span className="block text-[11px] text-[#697586] mb-1">
            المفتاح
            {s.hasKey && (
              <span className="text-[#00a344]"> · محفوظ {s.keyHint ?? ''}</span>
            )}
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={s.hasKey ? 'اتركه فارغاً للإبقاء على المفتاح الحالي' : current?.keyHelp}
            dir="ltr"
            autoComplete="off"
            className={INPUT}
          />
          <span className="flex items-start gap-1.5 text-[10px] text-[#9aa4b2] mt-1">
            <ShieldCheck className="w-3 h-3 shrink-0 mt-0.5 text-[#00a344]" />
            يُشفَّر قبل الحفظ، ولا تُعيده أي شاشة ولا أي واجهة بعد ذلك — ولا يظهر في سجل التدقيق.
          </span>
        </label>

        <label className="block">
          <span className="block text-[11px] text-[#697586] mb-1">
            البرومبت الثابت <span className="text-[#9aa4b2]">(اختياري)</span>
          </span>
          <textarea
            value={s.prompt}
            onChange={(e) => setS({ ...s, prompt: e.target.value })}
            rows={3}
            maxLength={4000}
            placeholder="يُضاف قبل كل طلب — مثلاً: أجب بالعربية دائماً، هوامشنا ضيّقة فلا تقترح خصومات."
            className="w-full px-2 py-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]"
          />
        </label>

        {error && (
          <p className="text-xs text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-lg p-2.5">{error}</p>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            احفظ
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#00a344]">
              <Check className="w-3.5 h-3.5" /> تم الحفظ
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
