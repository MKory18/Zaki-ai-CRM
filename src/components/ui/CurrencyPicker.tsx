'use client';

import React, { useState } from 'react';
import { CURRENCIES, minorUnitFor } from '@/lib/currencies';

/**
 * A COUNTRY'S CURRENCY AND ITS DECIMALS — ONE CONTROL, EVERY FORM.
 *
 * Adding a country from the entry screen, adding one in «البلدان والمتاجر»
 * and correcting one in its panel each drew their own select, and only one
 * of them could name a currency off the list: a country on GBP could be
 * created there and then not corrected, and the entry screen gave any
 * unlisted code two decimals without asking.
 *
 * Picking a listed currency fills in its official decimals. They stay
 * editable, and the control says so when they differ from the official ones
 * — this number decides how every amount in the country is rounded.
 */

export interface CurrencyChoice {
  code: string;
  /** null until chosen — never a silent default. */
  minorUnit: number | null;
}

const OTHER = '__other';
const listed = (code: string) => minorUnitFor(code) !== null;

/** Ready to send: a three-letter ISO code and chosen decimals. */
export function currencyChoiceReady(c: CurrencyChoice): boolean {
  return /^[A-Za-z]{3}$/.test(c.code.trim()) && c.minorUnit !== null;
}

const LABEL = 'block text-xs font-medium text-[var(--sys-foreground)]';
const CONTROL =
  'mt-1 block h-10 w-full rounded-[8px] border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-sm focus:outline-none focus:border-[var(--sys-primary)]';

export function CurrencyPicker({
  value,
  onChange,
  className = '',
}: {
  value: CurrencyChoice;
  onChange: (next: CurrencyChoice) => void;
  className?: string;
}) {
  const [other, setOther] = useState(false);
  const code = value.code.trim().toUpperCase();
  // Off the list: being typed now, or a country created on one before.
  const typing = !listed(code) && (other || code !== '');
  const official = minorUnitFor(code);

  const pick = (next: string) => {
    if (next === OTHER) {
      setOther(true);
      onChange({ code: '', minorUnit: null });
      return;
    }
    setOther(false);
    onChange({ code: next, minorUnit: minorUnitFor(next) });
  };

  return (
    <div className={`grid grid-cols-[1fr_7rem] gap-2 ${className}`}>
      <label className={LABEL}>
        العملة <span className="text-[var(--sys-destructive)]">*</span>
        <select required value={typing ? OTHER : code} onChange={(e) => pick(e.target.value)} className={CONTROL}>
          <option value="" disabled>
            اختر العملة
          </option>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.ar} ({c.code})
            </option>
          ))}
          <option value={OTHER}>عملة أخرى…</option>
        </select>
        {typing && (
          <input
            autoFocus={other}
            required
            dir="ltr"
            maxLength={3}
            aria-label="رمز العملة (ISO)"
            placeholder="ISO — مثل GBP"
            value={value.code}
            onChange={(e) => {
              const typed = e.target.value.toUpperCase();
              onChange({ code: typed, minorUnit: minorUnitFor(typed) ?? value.minorUnit });
            }}
            className={CONTROL}
          />
        )}
      </label>
      <label className={LABEL}>
        الخانات العشرية <span className="text-[var(--sys-destructive)]">*</span>
        <select
          required
          value={value.minorUnit ?? ''}
          onChange={(e) => onChange({ ...value, minorUnit: Number(e.target.value) })}
          className={CONTROL}
        >
          <option value="" disabled>
            —
          </option>
          {[0, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
              {official === n ? ' — الرسمي' : ''}
            </option>
          ))}
        </select>
      </label>
      {official !== null && value.minorUnit !== null && value.minorUnit !== official && (
        <p className="col-span-2 text-[11px] text-[var(--sys-warning)]">
          الرسمي لـ {code} هو {official} — كل مبلغ في هذا البلد سيُقرَّب على ما تختاره.
        </p>
      )}
    </div>
  );
}
