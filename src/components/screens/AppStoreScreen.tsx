'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LayoutGrid, Loader2, Check, Settings2, Plus, ShieldCheck, Copy, X, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { apiJson } from '@/lib/api-client';

/**
 * /apps/store — what this system can be connected to.
 *
 * Two shelves, honestly labelled. The built-ins are integrations this code
 * already knows how to speak to; installing one records that the company
 * uses it and sends you to the screen that configures it. The second shelf
 * is apps a developer registered: they are told what happens, and that is
 * all — being told is not being given the keys.
 */

interface BuiltIn {
  kind: 'BUILTIN';
  code: string;
  name: string;
  summary: string;
  description: string;
  categoryLabel: string;
  settingsPath: string;
  canManage: boolean;
  installed: boolean;
  enabled: boolean;
  configured: boolean;
}

interface External {
  kind: 'EXTERNAL';
  id: string;
  code: string;
  name: string;
  description: string | null;
  developerName: string | null;
  webhookUrl: string | null;
  events: string[];
  status: string;
  installed: boolean;
  enabled: boolean;
}

interface Shelf {
  builtIn: BuiltIn[];
  external: External[];
  availableEvents: { code: string; label: string }[];
}

export function AppStoreScreen() {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const load = useCallback(async () => {
    try {
      setShelf(await apiJson<Shelf>('/api/apps'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(appCode: string, action: 'install' | 'enable' | 'disable' | 'uninstall') {
    setBusy(appCode);
    setError(null);
    try {
      await apiJson('/api/apps/installs', { method: 'POST', body: JSON.stringify({ appCode, action }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التنفيذ');
    } finally {
      setBusy(null);
    }
  }

  if (!shelf) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#697586]">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#121926]">
            <LayoutGrid className="h-6 w-6 text-[#b8256e]" />
            متجر التطبيقات
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-[#697586]">
            ما يمكن وصل النظام به. الجاهزة يعرفها النظام مسبقاً ويكفي تفعيلها وإدخال
            حسابها؛ والمسجَّلة من مطوّرين تُخبَر بما يحدث عبر ويبهوك موقَّع.
          </p>
        </div>
        <Button size="sm" onClick={() => setRegistering(true)}>
          <Plus className="h-4 w-4" /> سجّل تطبيقاً
        </Button>
      </div>

      {error && (
        <p className="rounded-[8px] border border-[#fecdd1] bg-[#feecee] p-3 text-sm text-[#be123c]">{error}</p>
      )}

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#697586]">تكاملات جاهزة</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shelf.builtIn.map((a) => (
            <div
              key={a.code}
              className={`rounded-xl border p-4 ${
                a.installed && a.enabled ? 'border-[#b8256e]/40 bg-[#fdf2f7]' : 'border-[#e3e8ef] bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#121926]">{a.name}</p>
                  <p className="text-[11px] text-[#697586]">{a.summary}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#475467]">
                  {a.categoryLabel}
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-[#697586]">{a.description}</p>

              {/* Installed is not the same as working. A courier whose
                  credentials were cleared is installed and useless, and the
                  card says which. */}
              {a.installed && (
                <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${a.configured ? 'text-[#15803d]' : 'text-[#c2410c]'}`}>
                  {a.configured ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {a.configured ? 'مهيَّأ ويعمل' : 'مثبَّت لكن غير مهيَّأ — أدخل بياناته'}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!a.installed ? (
                  <Button size="sm" disabled={!a.canManage || busy === a.code} onClick={() => act(a.code, 'install')}>
                    {busy === a.code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    تثبيت
                  </Button>
                ) : (
                  <>
                    <Link href={a.settingsPath}>
                      <Button size="sm" variant="outline">
                        <Settings2 className="h-3.5 w-3.5" /> الإعدادات
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!a.canManage || busy === a.code}
                      onClick={() => act(a.code, a.enabled ? 'disable' : 'enable')}
                    >
                      {a.enabled ? 'إيقاف' : 'تفعيل'}
                    </Button>
                    <button
                      onClick={() => act(a.code, 'uninstall')}
                      disabled={!a.canManage || busy === a.code}
                      className="cursor-pointer text-[11px] text-[#9aa4b2] hover:text-rose-600"
                    >
                      إزالة
                    </button>
                  </>
                )}
                {!a.canManage && (
                  <span className="text-[10.5px] text-[#9aa4b2]">تحتاج صلاحية لتثبيته</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#697586]">
          تطبيقات مسجَّلة عندك
        </h2>
        {shelf.external.length === 0 ? (
          <p className="rounded-xl border border-[#e3e8ef] bg-white p-6 text-center text-xs leading-relaxed text-[#697586]">
            لا تطبيقات مسجَّلة بعد. سجّل واحداً ليصله ويبهوك موقَّع عند كل حدث تختاره —
            طلب جديد، تأكيد، شحن، تسليم، إرجاع.
          </p>
        ) : (
          <div className="space-y-2">
            {shelf.external.map((a) => (
              <div key={a.id} className="rounded-xl border border-[#e3e8ef] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#121926]">
                      {a.name} <span className="font-mono text-[11px] text-[#9aa4b2]" dir="ltr">{a.code}</span>
                    </p>
                    {a.developerName && <p className="text-[11px] text-[#697586]">{a.developerName}</p>}
                    {a.webhookUrl && (
                      <p className="mt-1 truncate font-mono text-[10.5px] text-[#697586]" dir="ltr">{a.webhookUrl}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!a.installed ? (
                      <Button size="sm" disabled={busy === a.code} onClick={() => act(a.code, 'install')}>
                        تثبيت
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy === a.code} onClick={() => act(a.code, a.enabled ? 'disable' : 'enable')}>
                        {a.enabled ? 'إيقاف' : 'تفعيل'}
                      </Button>
                    )}
                  </div>
                </div>
                {a.events.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.events.map((e) => (
                      <span key={e} className="rounded-full bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] text-[#475467]" dir="ltr">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {registering && (
        <RegisterApp
          events={shelf.availableEvents}
          onClose={() => setRegistering(false)}
          onDone={async () => { setRegistering(false); await load(); }}
        />
      )}
    </div>
  );
}

/**
 * Registering an app.
 *
 * The signing secret is generated on the server and shown once. Offering to
 * show it again would mean storing it readable, and a secret that can be
 * read back is a secret that will be read by the wrong person.
 */
function RegisterApp({
  events, onClose, onDone,
}: {
  events: { code: string; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ name: '', code: '', developerName: '', webhookUrl: '', description: '' });
  const [chosen, setChosen] = useState<string[]>(['order.created']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiJson<{ secret: string }>('/api/apps', {
        method: 'POST',
        body: JSON.stringify({ ...form, events: chosen }),
      });
      setSecret(res.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التسجيل');
    } finally {
      setSaving(false);
    }
  }

  if (secret) {
    return (
      <Modal isOpen onClose={onDone} title="سرّ التوقيع" subtitle="يُعرض مرة واحدة فقط">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-[#364152]">
            احفظه الآن. يوقّع كل ويبهوك بترويسة <code dir="ltr">X-Zaki-Signature</code> بصيغة
            {' '}<code dir="ltr">sha256=HMAC(secret, "&lt;timestamp&gt;.&lt;body&gt;")</code>؛
            الوقت داخل النصّ الموقَّع حتى لا يُعاد إرسال طلب مُلتقَط بعد أسبوع بنفس التوقيع.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-[#e3e8ef] bg-[#f8fafc] p-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-[#121926]" dir="ltr">{secret}</code>
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { /* blocked clipboard */ }
              }}
              className="shrink-0 cursor-pointer rounded-lg p-2 text-[#697586] hover:bg-white"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={onDone}>حفظته</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="تسجيل تطبيق" subtitle="يُخبَر بما يحدث عبر ويبهوك موقَّع">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="اسم التطبيق *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input
            label="الرمز *"
            dir="ltr"
            placeholder="MY_APP"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            required
          />
          <Input label="المطوّر" value={form.developerName} onChange={(e) => setForm({ ...form, developerName: e.target.value })} />
          <Input
            label="عنوان الويبهوك *"
            dir="ltr"
            placeholder="https://example.com/hooks/zaki"
            value={form.webhookUrl}
            onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
            required
          />
        </div>

        <Input label="وصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#121926]">الأحداث *</label>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {events.map((ev) => (
              <label key={ev.code} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3e8ef] px-2.5 py-1.5 text-xs text-[#364152]">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 cursor-pointer accent-[#b8256e]"
                  checked={chosen.includes(ev.code)}
                  onChange={(e) =>
                    setChosen(e.target.checked ? [...chosen, ev.code] : chosen.filter((c) => c !== ev.code))
                  }
                />
                {ev.label}
                <span className="ms-auto font-mono text-[10px] text-[#9aa4b2]" dir="ltr">{ev.code}</span>
              </label>
            ))}
          </div>
        </div>

        <p className="rounded-lg bg-[#f8fafc] p-2.5 text-[10.5px] leading-relaxed text-[#697586]">
          التطبيق يُخبَر فقط — لا يقرأ بياناتك ولا يعدّلها. عنوان الويبهوك يجب أن يكون
          <code dir="ltr"> https</code>، والإرسال يُعاد خمس مرات بتباعد متزايد قبل أن يُعلَّم فاشلاً.
        </p>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> إلغاء
          </Button>
          <Button type="submit" loading={saving} disabled={chosen.length === 0}>
            <Plus className="h-4 w-4" /> سجّل
          </Button>
        </div>
      </form>
    </Modal>
  );
}
