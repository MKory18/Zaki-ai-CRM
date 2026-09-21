'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { LABEL_SIZES } from '@/lib/labels';

/**
 * WHICH PAPER THE WAYBILL IS PRINTED ON.
 *
 * Three screens print waybills — the orders list, the batches screen and
 * the labels screen — and two of them used to send 100×150 no matter what
 * was loaded in the printer. A warehouse on A4 got thermal-sized labels
 * from the orders screen and correct ones from the labels screen, from the
 * same order, on the same afternoon.
 *
 * The fix is not a third dropdown. The size is a property of the PRINTER IN
 * THE ROOM, not of the click: nobody swaps a thermal roll for A4 between
 * one batch and the next. So it is chosen once and remembered on that
 * device, and every print button in the system reads the same answer.
 *
 * Per device is the point. Two people on two machines with two printers
 * must not overwrite each other's choice, which is exactly what storing it
 * on the account would do.
 */

const KEY = 'salesflow.labelSize';
const DEFAULT_KEY = LABEL_SIZES[0].key;

export interface LabelDims {
  width: number;
  height: number;
  sheetWidth?: number;
  sheetHeight?: number;
}

interface Stored {
  key: string;
  custom: { width: number; height: number };
}

const FALLBACK: Stored = { key: DEFAULT_KEY, custom: { width: 100, height: 150 } };

/** Storage can throw or come back empty; a print button must still work. */
function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FALLBACK;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const key = typeof parsed.key === 'string' ? parsed.key : DEFAULT_KEY;
    const w = Number(parsed.custom?.width);
    const h = Number(parsed.custom?.height);
    return {
      key,
      custom: {
        width: Number.isFinite(w) && w >= 40 && w <= 300 ? w : 100,
        height: Number.isFinite(h) && h >= 40 && h <= 300 ? h : 150,
      },
    };
  } catch {
    return FALLBACK;
  }
}

/** The millimetres to send, from a remembered choice. */
export function dimsOf(stored: Stored): LabelDims {
  const preset = LABEL_SIZES.find((s) => s.key === stored.key);
  if (!preset) return stored.custom;
  return {
    width: preset.width,
    height: preset.height,
    sheetWidth: preset.sheet?.width,
    sheetHeight: preset.sheet?.height,
  };
}

/**
 * The remembered size, and a setter that every other open screen hears.
 *
 * Rendering starts from the default and reads storage after mount: the
 * server has no localStorage, and rendering one size then another would
 * mismatch the markup it sent.
 */
export function useLabelSize() {
  const [stored, setStored] = useState<Stored>(FALLBACK);

  useEffect(() => {
    setStored(read());
    // Changing the printer on one tab must not leave another tab printing
    // the old size.
    const sync = (e: StorageEvent) => {
      if (e.key === KEY) setStored(read());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const update = useCallback((next: Stored) => {
    setStored(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* a printer choice is not worth failing a print over */
    }
  }, []);

  return {
    stored,
    dims: dimsOf(stored),
    label: LABEL_SIZES.find((s) => s.key === stored.key)?.label ?? `${stored.custom.width}×${stored.custom.height} مم`,
    setKey: (key: string) => update({ ...stored, key }),
    setCustom: (custom: { width: number; height: number }) => update({ ...stored, custom }),
  };
}

const INPUT =
  'w-full h-9 px-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]';

/**
 * The picker itself. `compact` is the one-line form that sits beside a
 * print button in a toolbar; the full form adds the custom millimetres.
 */
export function LabelSizePicker({
  compact,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { stored, setKey, setCustom } = useLabelSize();

  const select = (
    <select
      value={stored.key}
      onChange={(e) => setKey(e.target.value)}
      title="مقاس البوليصة — يُحفظ على هذا الجهاز"
      aria-label="مقاس البوليصة"
      className={compact ? `${INPUT} w-auto max-w-[13rem]` : INPUT}
    >
      {LABEL_SIZES.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
      <option value="custom">مقاس مخصص</option>
    </select>
  );

  if (compact) {
    return (
      <div className={className}>
        {select}
        {stored.key === 'custom' && (
          <span className="ms-2 inline-flex items-center gap-1" dir="ltr">
            <input
              type="number"
              min={40}
              max={300}
              value={stored.custom.width}
              onChange={(e) => setCustom({ ...stored.custom, width: Number(e.target.value) })}
              className={`${INPUT} w-16`}
              aria-label="العرض بالمليمتر"
            />
            <span className="text-[11px] text-[#9aa4b2]">×</span>
            <input
              type="number"
              min={40}
              max={300}
              value={stored.custom.height}
              onChange={(e) => setCustom({ ...stored.custom, height: Number(e.target.value) })}
              className={`${INPUT} w-16`}
              aria-label="الارتفاع بالمليمتر"
            />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-[11px] text-[#697586] mb-1">مقاس البوليصة</label>
      {select}
      {stored.key === 'custom' && (
        <div className="grid grid-cols-2 gap-2 mt-2" dir="ltr">
          <input
            type="number"
            min={40}
            max={300}
            value={stored.custom.width}
            onChange={(e) => setCustom({ ...stored.custom, width: Number(e.target.value) })}
            className={INPUT}
            aria-label="العرض بالمليمتر"
          />
          <input
            type="number"
            min={40}
            max={300}
            value={stored.custom.height}
            onChange={(e) => setCustom({ ...stored.custom, height: Number(e.target.value) })}
            className={INPUT}
            aria-label="الارتفاع بالمليمتر"
          />
        </div>
      )}
      <p className="text-[10px] text-[#9aa4b2] mt-1">يُحفظ على هذا الجهاز ويُستعمل في كل شاشات الطباعة.</p>
    </div>
  );
}
