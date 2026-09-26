'use client';

import React, { useState } from 'react';
import { Coins } from 'lucide-react';
import { CurrencyPicker, currencyChoiceReady, type CurrencyChoice } from '@/components/ui/CurrencyPicker';
import { minorUnitFor } from '@/lib/currencies';

/**
 * WHAT THIS PERSON'S COMMISSION IS COUNTED IN.
 *
 * Every entry used to be written in the order's currency, so an Egyptian
 * moderator working a Syrian store's orders was owed Syrian pounds — a
 * figure meaning nothing to them, and a balance nobody could hand over.
 *
 * Counting is one question; paying is another. There may be no Egyptian
 * wallet at all: the money leaves whichever wallet has it, at a rate the
 * owner writes when they pay. That is why this field names a CURRENCY and
 * not a wallet — a wallet chosen here would be a promise the business might
 * not be able to keep.
 *
 * Empty means the store's own currency, which is how it always worked and
 * stays right for everyone local.
 */
export function UserCommissionCurrency({
  userId,
  initial,
  canEdit,
}: {
  userId: string;
  initial: string | null;
  canEdit: boolean;
}) {
  const [choice, setChoice] = useState<CurrencyChoice>({
    code: initial ?? '',
    minorUnit: initial ? minorUnitFor(initial) ?? 2 : null,
  });
  const [saved, setSaved] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const code = choice.code.trim().toUpperCase();
  const changed = code !== saved;
  // Clearing it is always allowed; setting one needs a real ISO code.
  const valid = code === '' || currencyChoiceReady(choice);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateContact', commissionCurrency: code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذّر الحفظ');
      setSaved(code);
      setMsg({ ok: true, text: 'حُفظ.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-[var(--sys-surface)] px-3 py-2.5">
      <p className="flex items-center gap-1 text-caption text-[var(--sys-muted)]">
        <Coins className="h-3 w-3" /> عملة العمولة
      </p>

      {canEdit ? (
        <>
          <div className="mt-1">
            <CurrencyPicker value={choice} onChange={setChoice} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!changed || !valid || busy}
              className="h-8 rounded-md bg-[var(--sys-primary)] px-3 text-caption font-bold text-[var(--sys-primary-foreground)] disabled:opacity-40"
            >
              حفظ
            </button>
            {code !== '' && (
              <button
                type="button"
                onClick={() => { setChoice({ code: '', minorUnit: null }); }}
                className="text-caption text-[var(--sys-muted-foreground)] hover:text-[var(--sys-destructive)]"
              >
                استخدم عملة المتجر
              </button>
            )}
            {msg && <span className={`text-caption ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{msg.text}</span>}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs font-bold text-[var(--sys-heading)]">{saved || 'عملة المتجر'}</p>
      )}

      <p className="mt-1 text-caption leading-relaxed text-[var(--sys-muted)]">
        تُحتسب عمولته بهذه العملة ويُقال له رقمه بها. المحفظة التي يخرج منها المال تُختار وقت الصرف — قد
        تكون بعملة أخرى، ويُكتب سعر الصرف حينها.
      </p>
    </div>
  );
}
