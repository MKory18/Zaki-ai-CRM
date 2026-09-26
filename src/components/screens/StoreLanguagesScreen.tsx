'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';
import type { StoreLanguage } from '@/lib/store-languages';
import { RiCheckLine, RiInformationLine, RiLoader4Line } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { routeLabel } from '@/lib/route-registry';

/**
 * WHAT THE SHOP SPEAKS, AND WHICH WAY IT READS.
 *
 * One language, applied for real: the public pages carried `dir="rtl"` in
 * their markup, so a shop selling in English was mirrored — heading, price
 * and arrows all on the wrong side.
 *
 * Additional languages are NOT offered, and the screen says why rather than
 * showing a disabled control the seller will keep clicking. Letting them add
 * "English" while the shop kept answering in Arabic would be a promise the
 * system does not keep, and they would find out from a customer.
 */

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

export function StoreLanguagesScreen() {
  const [available, setAvailable] = useState<StoreLanguage[]>([]);
  const [language, setLanguage] = useState('ar');
  const [saved, setSaved] = useState('ar');
  const [dir, setDir] = useState<'rtl' | 'ltr'>('rtl');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ language: string; dir: 'rtl' | 'ltr'; available: StoreLanguage[] }>(
        '/api/store/language'
      );
      setAvailable(data.available);
      setLanguage(data.language);
      setSaved(data.language);
      setDir(data.dir);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const data = await apiJson<{ language: string; dir: 'rtl' | 'ltr' }>('/api/store/language', {
        method: 'PUT',
        body: JSON.stringify({ language }),
      });
      setSaved(data.language);
      setDir(data.dir);
      setMsg({ ok: true, text: 'تم الحفظ — صفحات المتجر تُعرض بهذه اللغة واتجاهها' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const chosen = available.find((l) => l.code === language);

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={routeLabel('/store/languages')}
          description="اللغة التي تُكتب بها صفحات متجرك، والاتجاه الذي تُقرأ به."
        />
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
            {msg.ok && <RiCheckLine className="mb-0.5 ml-1 inline h-4 w-4" />}
            {msg.text}
          </span>
        )}
      </header>

      <div className={CARD}>
        <p className="mb-3 text-sm font-bold text-[var(--sys-heading)]">اللغة الافتراضية</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLanguage(l.code)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-start transition ${
                language === l.code
                  ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/5'
                  : 'border-[var(--sys-border)] hover:border-[var(--sys-primary)]/40'
              }`}
            >
              <span className="text-sm font-medium text-[var(--sys-heading)]" dir={l.dir}>{l.label}</span>
              <span className="rounded-full bg-[var(--sys-surface-strong)] px-2 py-0.5 text-xs font-semibold text-[var(--sys-muted-foreground)]">
                {l.dir === 'rtl' ? 'من اليمين' : 'من اليسار'}
              </span>
            </button>
          ))}
        </div>

        {/* The direction is derived, and shown as a consequence — not as a
            second control that could be set to disagree with the language. */}
        <p className="mt-3 text-xs text-[var(--sys-muted-foreground)]">
          الاتجاه يتبع اللغة: «{chosen?.label}» تُقرأ{' '}
          <strong>{chosen?.dir === 'rtl' ? 'من اليمين إلى اليسار' : 'من اليسار إلى اليمين'}</strong>.
          لا يُضبط منفصلاً حتى لا يتناقض الاثنان.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={busy || language === saved} onClick={() => void save()}>
            {busy && <RiLoader4Line className="h-4 w-4 animate-spin" />} حفظ
          </Button>
          {language !== saved && (
            <Button variant="secondary" size="sm" onClick={() => setLanguage(saved)}>تراجع</Button>
          )}
          <span className="text-xs text-[var(--sys-muted)]">
            المحفوظ حالياً: {available.find((l) => l.code === saved)?.label} ({dir === 'rtl' ? 'RTL' : 'LTR'})
          </span>
        </div>
      </div>

      {/* Said plainly, rather than shown as a disabled control nobody can
          make work. */}
      <div className={`${CARD} border-[var(--sys-border)]`}>
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--sys-heading)]">
          <RiInformationLine className="h-4 w-4 text-[var(--sys-muted-foreground)]" />
          لغات إضافية — غير متاحة بعد، وهذا ما تحتاجه
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          لغة ثانية ليست خانة تُضاف: تعني نسخة ثانية من كل نصّ يراه الزبون — اسم كل منتج ووصفه،
          كلمات كل قسم في الصفحات، الصفحات الثابتة الخمس، ونصوص الدفع والتأكيد. تحتاج مخزن ترجمة
          لكل حقل، ومحرّراً بجانب كل حقل، وقاعدة لما تفعله الصفحة حين تنقص ترجمة.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          لم نضع لك زرّاً يضيف «English» بينما يبقى المتجر يجيب بالعربية — كنت ستكتشف ذلك من زبون.
          حين تقرّر أنّك تحتاجها فعلاً، هي مشروع مستقل وليست حقلاً في هذه الشاشة.
        </p>
      </div>
    </div>
  );
}
