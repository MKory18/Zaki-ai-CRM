'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Italic,
  LayoutPanelTop,
  Loader2,
  Minus,
  PaintBucket,
  Plus,
  RectangleHorizontal,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import type { BlockLook, SectionType } from '@/lib/landing-sections';
import { FONTS } from '@/lib/landing-theme';
import { lookPartReason, lookParts, type LookParts } from '@/lib/block-look';

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
 *
 * «هاي اللوحة باللاندنج فيها مشاكل بدها حل». Each tab now says its name in words (four icons in a row read as two
 * palettes and a brush beside the bar's own copy/paste), the open tab's rows sit on their own line under the tabs so
 * nothing moves sideways, and a part that does nothing on this block is still there — pressing it says why.
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

/** One font the select may offer: the page theme's library and the store's own uploads (`u:<key>`). */
export interface LookFont {
  key: string;
  label: string;
  stack: string;
  note: string;
}

// The library is the page theme's, not a copy: see FONTS in landing-theme.
// An empty key means "whatever the page is set to", which is the right
// default — a block that names its own face is a block that stops following
// a theme change, and most blocks should follow.
const PAGE_FONT: LookFont = { key: '', label: 'خط الصفحة', stack: 'inherit', note: 'يتبع الثيم' };

const BTN_SIZES: { key: 's' | 'm' | 'l'; label: string }[] = [
  { key: 's', label: 'صغير' },
  { key: 'm', label: 'عادي' },
  { key: 'l', label: 'كبير' },
];

const SCALES: BlockLook['text']['scale'][] = ['xs', 's', 'm', 'l', 'xl'];

export const SWATCHES = ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#b8256e', '#7c3aed', '#111827', '#ffffff'];

const CHIP =
  'cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition-colors';
const ON = 'border-[#b8256e] bg-[#fdf5fa] text-[#b8256e] font-semibold';
const OFF = 'border-[#e3e8ef] bg-white text-[#697586] hover:border-[#b8256e]/40';

type Tab = 'layout' | 'text' | 'button' | 'bg';
const TAB_PART: Record<Tab, keyof LookParts> = { layout: 'box', text: 'text', button: 'button', bg: 'box' };

export function LookControls({
  look,
  type,
  fonts,
  onChange,
  onUpload,
}: {
  look: BlockLook;
  /** Which block this is — decides which parts of the panel mean anything (`lookParts`). */
  type: SectionType;
  /** The theme's fonts and the store's uploads; the theme's library alone when absent. */
  fonts?: LookFont[];
  onChange: (next: BlockLook) => void;
  /** Uploads an image and returns its URL — the page's own uploader. */
  onUpload?: (file: File) => Promise<string | null>;
}) {
  /**
   * Folded until asked for.
   *
   * Unfolded, this is twenty-odd controls riding on a bar that sits on top
   * of the block — it would cover the thing being styled. Most edits are a
   * word or a reorder and never open it at all.
   */
  const [open, setOpen] = useState<Tab | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = look.background;
  const text = look.text;
  const btn = look.button;
  const parts = lookParts(type);

  /**
   * Every change reads from a ref, not from the render's closure.
   *
   * Two changes inside one tick — a slider released onto a swatch, a click
   * that lands while the previous render is still in flight — would
   * otherwise both start from the same old value, and the first would be
   * quietly undone. The person sees one of their two choices ignored and
   * has no way to tell which.
   *
   * The ref is filled from an effect, not from the render body. A write
   * during render is a write a discarded render also performs — React may
   * render this panel for a `look` it never commits (StrictMode's double
   * pass, a concurrent retry it throws away), and the next click would then
   * patch a value that was never on screen, which is the very bug this ref
   * exists to prevent. An effect runs only after a render is committed, so
   * `latest.current` is always the look the seller is actually looking at;
   * handlers fire after paint, so they see exactly what they saw before.
   */
  const latest = useRef(look);
  useEffect(() => {
    latest.current = look;
  }, [look]);

  const set = (patch: Partial<BlockLook>) => onChange({ ...latest.current, ...patch });
  const setBg = (patch: Partial<BlockLook['background']>) =>
    onChange({ ...latest.current, background: { ...latest.current.background, ...patch } });
  const setText = (patch: Partial<BlockLook['text']>) =>
    onChange({ ...latest.current, text: { ...latest.current.text, ...patch } });
  const setBtn = (patch: Partial<BlockLook['button']>) =>
    onChange({ ...latest.current, button: { ...latest.current.button, ...patch } });

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

  // The store's uploads belong in the list too — a block set to one of them showed «خط الصفحة» and looked unset.
  // A saved `u:` font that has since been deleted is still named, so the select never shows a value it does not hold.
  const fontOptions: LookFont[] = [PAGE_FONT, ...(fonts ?? FONTS)];
  if (text.font && !fontOptions.some((f) => f.key === text.font)) {
    fontOptions.push({ key: text.font, label: 'خط محذوف', stack: 'inherit', note: 'اختر غيره' });
  }

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

  const tab = (key: Tab, label: string, title: string, Icon: typeof AlignCenter) => (
    <button
      type="button"
      onClick={() => setOpen(open === key ? null : key)}
      title={title}
      aria-expanded={open === key}
      className={`${CHIP} ${open === key ? ON : OFF} inline-flex items-center gap-1 ${parts[TAB_PART[key]] ? '' : 'opacity-60'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  const off = open && !parts[TAB_PART[open]];

  return (
    <div className="flex w-full flex-wrap items-center gap-1">
      {/* Four doors, each named. Icons alone read as two palettes and a brush beside the bar's own copy and paste. */}
      {tab('layout', 'التنسيق', 'الاتساع والمحاذاة والتباعد', LayoutPanelTop)}
      {tab('text', 'النص', 'الخط والحجم واللون', Type)}
      {tab('button', 'الزر', 'لون الزر وحجمه', RectangleHorizontal)}
      {tab('bg', 'الخلفية', 'لون أو تدرّج أو صورة خلف القسم', PaintBucket)}

      {/* The open tab's rows on a line of their own: opening one only adds height, nothing moves sideways. */}
      {open && (
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
          {off ? (
            <p className="text-[11px] text-[#697586]">{lookPartReason(type, TAB_PART[open])}</p>
          ) : (
            <>
              {/* ── الاتساع والمحاذاة والتباعد ── */}
              {open === 'layout' && (
                <>
                  <Row label="الاتساع">
                    {WIDTHS.map((w) => (
                      <button type="button" key={w.key} onClick={() => set({ width: w.key })} className={`${CHIP} ${look.width === w.key ? ON : OFF}`}>
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
                      <button type="button" key={key} title={title} aria-label={title} onClick={() => set({ align: key })} className={`${CHIP} ${look.align === key ? ON : OFF}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </Row>

                  <Row label="التباعد">
                    {SPACES.map((s) => (
                      <button type="button" key={s.key} onClick={() => set({ space: s.key })} className={`${CHIP} ${look.space === s.key ? ON : OFF}`}>
                        {s.label}
                      </button>
                    ))}
                  </Row>
                </>
              )}

              {/* ── الخط ── */}
              {open === 'text' && (
                <>
                  <Row label="خط القسم">
                    <select
                      value={text.font}
                      aria-label="خط القسم"
                      onChange={(e) => setText({ font: e.target.value as BlockLook['text']['font'] })}
                      className="h-7 min-w-0 max-w-full rounded-lg border border-[#e3e8ef] bg-white px-2 text-[11px] text-[#364152]"
                    >
                      {fontOptions.map((f) => (
                        // Each name is drawn in its own face, so the list is a specimen
                        // sheet rather than thirteen identical words.
                        <option key={f.key} value={f.key} style={{ fontFamily: f.stack }}>
                          {f.label} — {f.note}
                        </option>
                      ))}
                    </select>
                    <button type="button" title="أصغر" aria-label="أصغر" onClick={() => step(-1)} disabled={scaleIndex <= 0} className={`${CHIP} ${OFF} disabled:opacity-40`}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[2.5rem] text-center text-[11px] text-[#697586]">
                      {['صغير جداً', 'صغير', 'عادي', 'كبير', 'كبير جداً'][scaleIndex] ?? 'عادي'}
                    </span>
                    <button type="button" title="أكبر" aria-label="أكبر" onClick={() => step(1)} disabled={scaleIndex >= SCALES.length - 1} className={`${CHIP} ${OFF} disabled:opacity-40`}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    {/* For the WHOLE block — the selection bar's «B» and «I» style the chosen words only. */}
                    <button
                      type="button"
                      title="مائل — للقسم كله"
                      aria-label="مائل — للقسم كله"
                      aria-pressed={!!text.italic}
                      onClick={() => setText({ italic: !text.italic })}
                      className={`${CHIP} ${text.italic ? ON : OFF}`}
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="عريض — للقسم كله"
                      aria-label="عريض — للقسم كله"
                      aria-pressed={text.weight === 'bold'}
                      onClick={() => setText({ weight: text.weight === 'bold' ? '' : 'bold' })}
                      className={`${CHIP} ${text.weight === 'bold' ? ON : OFF} font-bold`}
                    >
                      B
                    </button>
                  </Row>

                  <Row label="لون النص">
                    {parts.textColor ? (
                      <Swatches
                        label="لون النص"
                        value={text.color}
                        onPick={(c) => setText({ color: c })}
                        clearLabel="تلقائي"
                        clearTitle="كل سطر بيرجع للونه بالقالب"
                      />
                    ) : (
                      <span className="text-[11px] text-[#697586]">{lookPartReason(type, 'textColor')}</span>
                    )}
                  </Row>

                  {/* A heading is its own decision — one colour for the whole block
                      made the headline, the price and the button all the same shade. */}
                  <Row label="لون العناوين">
                    {parts.heading ? (
                      <Swatches
                        label="لون العناوين"
                        value={text.headingColor}
                        onPick={(c) => setText({ headingColor: c })}
                        clearLabel="مثل لون النص"
                        clearTitle="العناوين بتاخد لون النص"
                      />
                    ) : (
                      <span className="text-[11px] text-[#697586]">{lookPartReason(type, 'heading')}</span>
                    )}
                  </Row>
                </>
              )}

              {/* ── الزر ── */}
              {open === 'button' && (
                <>
                  <Row label="لون الزر">
                    <Swatches label="لون الزر" value={btn.fill} onPick={(c) => setBtn({ fill: c })} clearLabel="لون الهوية" />
                  </Row>
                  <Row label="لون كلماته">
                    <Swatches label="لون كلمات الزر" value={btn.label} onPick={(c) => setBtn({ label: c })} clearLabel="تلقائي" />
                  </Row>
                  <Row label="حجم الزر">
                    {BTN_SIZES.map((b) => (
                      <button type="button" key={b.key} onClick={() => setBtn({ size: b.key })} className={`${CHIP} ${btn.size === b.key ? ON : OFF}`}>
                        {b.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => setBtn({ wide: !btn.wide })} aria-pressed={!!btn.wide} className={`${CHIP} ${btn.wide ? ON : OFF}`}>
                      بعرض الصفحة
                    </button>
                  </Row>
                </>
              )}

              {/* ── الخلفية ── */}
              {open === 'bg' && (
                <>
                  <Row label="الخلفية">
                    {([
                      ['none', 'بلا'],
                      ['solid', 'لون'],
                      ['gradient', 'تدرّج'],
                      ['image', 'صورة'],
                    ] as const).map(([key, label]) => (
                      <button type="button" key={key} onClick={() => setBg({ kind: key })} className={`${CHIP} ${bg.kind === key ? ON : OFF}`}>
                        {label}
                      </button>
                    ))}
                  </Row>

                  {bg.kind === 'solid' && (
                    <Row label="اللون">
                      <Swatches label="لون الخلفية" value={bg.from} onPick={(c) => setBg({ from: c })} />
                    </Row>
                  )}

                  {bg.kind === 'gradient' && (
                    <>
                      <Row label="من">
                        <Swatches label="بداية التدرّج" value={bg.from} onPick={(c) => setBg({ from: c })} />
                      </Row>
                      <Row label="إلى">
                        <Swatches label="نهاية التدرّج" value={bg.to} onPick={(c) => setBg({ to: c })} />
                      </Row>
                      <Row label="الاتجاه">
                        <input
                          type="range"
                          min={0}
                          max={360}
                          step={10}
                          value={bg.angle}
                          aria-label="اتجاه التدرّج"
                          onChange={(e) => setBg({ angle: Number(e.target.value) })}
                          className="h-1 flex-1 accent-[#b8256e]"
                        />
                        <span className="w-10 text-center text-[11px] text-[#697586]" dir="ltr">{bg.angle}°</span>
                      </Row>
                      {/* Its own line, full width: inside the row it collapsed to a 2px sliver. */}
                      <div
                        className="h-7 w-full rounded-lg border border-[#e3e8ef]"
                        style={{ background: `linear-gradient(${bg.angle}deg, ${bg.from || '#e3e8ef'}, ${bg.to || bg.from || '#e3e8ef'})` }}
                      />
                    </>
                  )}

                  {bg.kind === 'image' && (
                    <>
                      <Row label="الصورة">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={busy || !onUpload}
                          className={`${CHIP} ${OFF} disabled:opacity-40`}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {bg.image ? ' تغيير' : ' ارفع صورة'}
                        </button>
                        {bg.image && (
                          <button type="button" title="أزِل الصورة" aria-label="أزِل الصورة" onClick={() => setBg({ image: '' })} className={`${CHIP} ${OFF}`}>
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
                          aria-label="تعتيم الصورة"
                          onChange={(e) => setBg({ overlay: Number(e.target.value) })}
                          className="h-1 flex-1 accent-[#b8256e]"
                        />
                        <span className="w-10 text-center text-[11px] text-[#697586]" dir="ltr">
                          {Math.round(bg.overlay * 100)}%
                        </span>
                      </Row>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One group, wrapping when the panel is narrow.
 *
 * The stacked version was a wall of seven rows: every block showed every
 * control at once whether it needed it or not, and finding the one you
 * wanted meant reading all of them. Side by side, with a hairline between
 * groups, the whole thing is one glance — and at a phone's width the group
 * wraps instead of running off the edge of the page.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="shrink-0 text-[10px] font-semibold text-[#9aa4b2]">{label}</span>
      {children}
    </div>
  );
}

/** The ring that says «this one»: a white gap and a dark line, visible on every swatch — the accent and white too. */
const PICKED_RING = '0 0 0 2px #ffffff, 0 0 0 4px #121926';

function Swatches({
  label,
  value,
  onPick,
  clearLabel = 'بلا',
  clearTitle,
}: {
  label: string;
  value: string;
  onPick: (c: string) => void;
  clearLabel?: string;
  clearTitle?: string;
}) {
  const v = (value ?? '').toLowerCase();
  // A colour that is not one of the eight is a custom one — and the custom chip shows it, ringed, instead of a
  // magenta square that was never chosen.
  const custom = /^#[0-9a-f]{6}$/.test(v) && !SWATCHES.includes(v) ? v : '';
  // The input is hidden, so its keyboard focus is drawn on the chip.
  const [focused, setFocused] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => onPick('')}
        title={clearTitle ?? clearLabel}
        aria-pressed={!v}
        className={`${CHIP} ${v ? OFF : ON}`}
      >
        {clearLabel}
      </button>
      {SWATCHES.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onPick(c)}
          title={c}
          aria-label={`${label} ${c}`}
          aria-pressed={v === c}
          style={{ background: c, boxShadow: v === c ? PICKED_RING : undefined }}
          className="h-5 w-5 cursor-pointer rounded-full border-2 border-[#e3e8ef]"
        />
      ))}
      {/* The eight are the common answers; this is for the brand colour that is not one of them. */}
      <label
        title={custom ? `لون خاص ${custom}` : 'لون آخر'}
        className={`${CHIP} ${custom ? ON : OFF} inline-flex items-center gap-1`}
        style={focused ? { boxShadow: '0 0 0 2px #b8256e' } : undefined}
      >
        {custom ? (
          <span className="h-3 w-3 rounded-full" style={{ background: custom, boxShadow: PICKED_RING }} />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        <input
          type="color"
          aria-label={`${label} — لون آخر`}
          // Opens on the colour the block has now; #000001 only when it has none (a value no swatch holds).
          value={/^#[0-9a-f]{6}$/.test(v) ? v : '#000001'}
          onChange={(e) => onPick(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="sr-only"
        />
      </label>
    </>
  );
}
