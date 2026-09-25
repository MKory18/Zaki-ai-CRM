'use client';

import React, { useEffect, useState } from 'react';
import { Building2, Check, Loader2, Settings } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PerformanceSettingsCard } from '@/components/settings/PerformanceSettingsCard';

/**
 * SYSTEM SETTINGS — what belongs to the company as a whole, and only that.
 *
 * This screen used to carry an org currency and a country of operation
 * (the Country model owns both), a default fee and a default commission
 * nothing read, an AI model nothing used, a second copy of the AI settings
 * and a card advertising "webhooks" that needed a logged-in session. Its
 * Save button replaced the whole settings document with three of those
 * fields, wiping the AI key and the message templates as it went.
 *
 * What is left is the company's name — its only editor — and the message
 * templates, which are written for every store the company runs.
 */
export function SystemSettingsScreen() {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setName(data.company?.name ?? '');
          setSaved(data.company?.name ?? '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الحفظ');
      setSaved(json.company?.name ?? name.trim());
      setMsg({ ok: true, text: 'حُفظ اسم الشركة.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'تعذر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  const dirty = name.trim() !== saved.trim();

  return (
    <div className="max-w-3xl space-y-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
          <Settings className="h-5 w-5 text-[#b8256e]" /> إعدادات النظام
        </h1>
        <p className="mt-0.5 text-xs text-[#697586]">
          ما يخصّ الشركة كلها. العملة والبلد في «البلدان والمتاجر والمحافظ»، والذكاء الاصطناعي في شاشته.
        </p>
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#b8256e]" /> بيانات الشركة
            </span>
          }
        />
        <CardContent>
          {loading ? (
            <div className="flex h-16 items-center justify-center text-[#697586]">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <form onSubmit={save} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Input label="اسم الشركة" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
              </div>
              <Button type="submit" disabled={busy || !dirty || name.trim().length < 2}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                احفظ
              </Button>
              {msg && (
                <p className={`w-full text-xs font-medium ${msg.ok ? 'text-[#00994d]' : 'text-rose-600'}`}>{msg.text}</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* How people are measured belongs with what the company is, not on a
          reports screen: these are the bars the business judges by, and
          they are a decision rather than a reading. */}
      <PerformanceSettingsCard />

    </div>
  );
}
