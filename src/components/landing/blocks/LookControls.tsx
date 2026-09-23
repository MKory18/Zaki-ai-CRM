'use client';

import React, { useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, Italic,
  Loader2, Minus, Palette, Plus, Trash2, Type, Upload,
} from 'lucide-react';
import type { BlockLook } from '@/lib/landing-sections';

/**
 * HOW THIS BLOCK LOOKS — the same strip for all thirteen.
 *
 * One panel, not a set of options grown into each block's own form. Every
 * block answers the same four questions — how wide, lined up where, how
 * much air, what is behind it — and a page where each block asks them
 * differently is a page nobody can lay out quickly.
 *
 * Nothing here is a pixel and nothing here is per-device. "Wide" is wide on
 * a laptop and edge-to-edge on a phone, because that is what wide means on
 * a phone. The seller never meets a breakpoint.
 */

const WIDTHS: { key: BlockLook['width']; label: string }[] = [
  { key: 'narrow', label: 'ضيّق' },
  { key: 'normal', label: 'عادي' },
  { key: 'wide', label: 'عريض' },
  { key: 'full', label: 'كامل' },
];

const SPACES: { key: BlockLook['space']; label: string }[] = [
  { key: 'none', label: 'بلا' },
  { key: 'tight', label: 'ضيّق' },
  { key: 'normal', label: 'عادي' },
  { key: 'roomy', label: 'واسع' },
];

const FONTS: { key: string; label: string }[] = [
  { key: '', label: 'خط الصفحة' },
  { key: 'cairo', label: 'القاهرة' },
  { key: 'tajawal', label: 'طَجوال' },
  { key: 'almarai', label: 'المراعي' },
  { key: 'system', label: 'خط النظام' },
];

const SCALES: BlockLook['text']['scale'][] = ['xs', 's', 'm', 'l', 'xl'];

const SWATCHES = ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#b8256e', '#7c3aed', '#111827', '#ffffff'];

const CHIP =
  'cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition-colors';
const ON = 'border-[#b8256e] bg-[#fdf5fa] text-[#b8256e] font-semibold';
const OFF = 'border-[#e3e8ef] bg-white text-[#697586] hover:border-[#b8256e]/40';

export function LookControls({
  look,
  onChange,
  onUpload,
}: {
  look: BlockLook;
  onChange: (next: BlockLook) => void;
  /** Uploads an image and returns its URL — the page's own uploader. */
  onUpload?: (file: File) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = look.background;
  const text = look.text;

  /**
   * Every change reads from a ref, not from the render's closure.
   *
   * Two changes inside one tick — a slider released onto a swatch, a click
   * that lands while the previous render is still in flight — would
   * otherwise both start from the same old value, and the first would be
   * quietly undone. The person sees one of their two choices ignored and
   * has no way to tell which.
   */
  const latest = useRef(look);
  latest.current = look;

  const set = (patch: Partial<BlockLook>) => onChange({ ...latest.current, ...patch });
  const setBg = (patch: Partial<BlockLook['background']>) =>
    onChange({ ...latest.current, background: { ...latest.current.background, ...patch } });
  const setText = (patch: Partial<BlockLook['text']>) =>
    onChange({ ...latest.current, text: { ...latest.current.text, ...patch } });

  /**
   * A block saved before any of this existed has no scale, so indexOf gave
   * -1 — which read as "already at the smallest" and left «أصغر» dead while
   * «أكبر» worked. Absent means normal, not before-the-beginning.
   */
  const found = SCALES.indexOf(text.scale);
  const scaleIndex = found === -1 ? SCALES.indexOf('m') : found;
  const step = (by: number) => {
    const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, scaleIndex + by))];
    if (next) setText({ scale: next });
  };

  const pickImage = async (file: File) => {
    if (!onUpload) return;
    setBusy(true);
    try {
      const url = await onUpload(file);
      if (url) setBg({ kind: 'image', image: url });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {/* ── الاتساع والمحاذاة والتباعد ── */}
      <Row label="الاتساع">
        {WIDTHS.map((w) => (
          <button key={w.key} onClick={() => set({ width: w.key })} className={`${CHIP} ${look.width === w.key ? ON : OFF}`}>
            {w.label}
          </button>
        ))}
      </Row>

      <Row label="المحاذاة">
        {([
          ['start', AlignRight, 'لليمين'],
          ['center', AlignCenter, 'للنص'],
          ['end', AlignLeft, 'لليسار'],
        ] as const).map(([key, Icon, title]) => (
          <button key={key} title={title} onClick={() => set({ align: key })} className={`${CHIP} ${look.align === key ? ON : OFF}`}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </Row>

      <Row label="التباعد">
        {SPACES.map((s) => (
          <button key={s.key} onClick={() => set({ space: s.key })} className={`${CHIP} ${look.space === s.key ? ON : OFF}`}>
            {s.label}
          </button>
        ))}
      </Row>

      {/* ── الخط ── */}
      <Row label="الخط">
        <select
          value={text.font}
          onChange={(e) => setText({ font: e.target.value as BlockLook['text']['font'] })}
          className="h-7 rounded-lg border border-[#e3e8ef] bg-white px-2 text-[11px] text-[#364152]"
        >
          {FONTS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <button title="أصغر" onClick={() => step(-1)} disabled={scaleIndex <= 0} className={`${CHIP} ${OFF} disabled:opacity-40`}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.5rem] text-center text-[11px] text-[#697586]">
          {['صغير جداً', 'صغير', 'عادي', 'كبير', 'كبير جداً'][scaleIndex] ?? 'عادي'}
        </span>
        <button title="أكبر" onClick={() => step(1)} disabled={scaleIndex >= SCALES.length - 1} className={`${CHIP} ${OFF} disabled:opacity-40`}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button title="مائل" onClick={() => setText({ italic: !text.italic })} className={`${CHIP} ${text.italic ? ON : OFF}`}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          title="عريض"
          onClick={() => setText({ weight: text.weight === 'bold' ? '' : 'bold' })}
          className={`${CHIP} ${text.weight === 'bold' ? ON : OFF} font-bold`}
        >
          B
        </button>
      </Row>

      <Row label="لون الخط">
        <Swatches
          value={text.color}
          onPick={(c) => setText({ color: c })}
          clearLabel="لون الصفحة"
        />
      </Row>

      {/* ── الخلفية ── */}
      <Row label="الخلفية">
        {([
          ['none', 'بلا'],
          ['solid', 'لون'],
          ['gradient', 'تدرّج'],
          ['image', 'صورة'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setBg({ kind: key })} className={`${CHIP} ${bg.kind === key ? ON : OFF}`}>
            {label}
          </button>
        ))}
      </Row>

      {bg.kind === 'solid' && (
        <Row label="اللون">
          <Swatches value={bg.from} onPick={(c) => setBg({ from: c })} />
        </Row>
      )}

      {bg.kind === 'gradient' && (
        <>
          <Row label="من">
            <Swatches value={bg.from} onPick={(c) => setBg({ from: c })} />
          </Row>
          <Row label="إلى">
            <Swatches value={bg.to} onPick={(c) => setBg({ to: c })} />
          </Row>
          <Row label="الاتجاه">
            <input
              type="range"
              min={0}
              max={360}
              step={10}
              value={bg.angle}
              onChange={(e) => setBg({ angle: Number(e.target.value) })}
              className="h-1 flex-1 accent-[#b8256e]"
            />
            <span className="w-10 text-center text-[11px] text-[#697586]" dir="ltr">{bg.angle}°</span>
          </Row>
          <div
            className="h-7 rounded-lg border border-[#e3e8ef]"
            style={{ background: `linear-gradient(${bg.angle}deg, ${bg.from || '#e3e8ef'}, ${bg.to || bg.from || '#e3e8ef'})` }}
          />
        </>
      )}

      {bg.kind === 'image' && (
        <>
          <Row label="الصورة">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy || !onUpload}
              className={`${CHIP} ${OFF} disabled:opacity-40`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {bg.image ? ' تغيير' : ' ارفع صورة'}
            </button>
            {bg.image && (
              <button title="أزِل الصورة" onClick={() => setBg({ image: '' })} className={`${CHIP} ${OFF}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void pickImage(f);
              }}
            />
          </Row>
          {/* Not decoration: white text on a bright photograph is unreadable
              exactly as often as the photograph is bright. */}
          <Row label="تعتيم">
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={bg.overlay}
              onChange={(e) => setBg({ overlay: Number(e.target.value) })}
              className="h-1 flex-1 accent-[#b8256e]"
            />
            <span className="w-10 text-center text-[11px] text-[#697586]" dir="ltr">
              {Math.round(bg.overlay * 100)}%
            </span>
          </Row>
        </>
      )}
    </div>
  );
}

/**
 * One group on a single line, not a labelled row in a stack.
 *
 * The stacked version was a wall of seven rows: every block showed every
 * control at once whether it needed it or not, and finding the one you
 * wanted meant reading all of them. Side by side, with a hairline between
 * groups, the whole thing is one glance.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="shrink-0 text-[10px] font-semibold text-[#9aa4b2]">{label}</span>
      {children}
    </div>
  );
}

function Swatches({
  value,
  onPick,
  clearLabel = 'بلا',
}: {
  value: string;
  onPick: (c: string) => void;
  clearLabel?: string;
}) {
  return (
    <>
      <button onClick={() => onPick('')} title={clearLabel} className={`${CHIP} ${value ? OFF : ON}`}>
        {clearLabel}
      </button>
      {SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          title={c}
          style={{ background: c }}
          className={`h-5 w-5 cursor-pointer rounded-full border-2 ${
            value.toLowerCase() === c ? 'border-[#b8256e]' : 'border-[#e3e8ef]'
          }`}
        />
      ))}
      {/* The eight are the common answers; this is for the brand colour that
          is not one of them. */}
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#b8256e'}
        onChange={(e) => onPick(e.target.value)}
        title="لون آخر"
        className="h-5 w-6 cursor-pointer rounded border border-[#e3e8ef] bg-white p-0"
      />
    </>
  );
}
