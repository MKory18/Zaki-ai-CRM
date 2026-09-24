'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Eye, EyeOff, Trash2, Plus, Minus, Upload, Loader2, GripVertical,
  Monitor, Smartphone, X, Paintbrush, LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LookControls } from './LookControls';
import { useInlineEdit } from './useInlineEdit';
import { Input } from '@/components/ui/Input';
import {
  type LandingSection, type SectionType,
  SECTION_LABEL, SECTION_HINT, SINGLETON, newSection,
} from '@/lib/landing-sections';
import {
  type LandingTheme, type FontValue, DEFAULT_THEME, MOODS, FONTS, paletteFor, paletteVars, isValidHex,
} from '@/lib/landing-theme';
import { PageBlocks } from './PageBlocks';
import { BLOCK_CSS_WITH_DEV_FONTS, fontHref, specimenHref } from './styles';
import { FontUploader, type StoreFontRow } from './FontUploader';
import { SelectionBar } from './SelectionBar';
import { PAGE_TEMPLATES, buildTemplate } from '@/lib/page-templates';
import { useConfirm } from '@/components/ui/Confirm';
import { sanitizeRich } from '@/lib/rich-text';

/**
 * The block builder.
 *
 * Left: the theme, then the blocks in page order. Right: the page itself,
 * rendered by the SAME component the public page uses — not an approximation
 * of it. A preview that is drawn by different code is a preview that can be
 * wrong, and the one moment you find out is after publishing.
 */

interface Props {
  theme: LandingTheme;
  sections: LandingSection[];
  onTheme: (t: LandingTheme) => void;
  onSections: (s: LandingSection[]) => void;
  /** Uploads images and returns their URLs. */
  onUpload: (files: FileList) => Promise<string[]>;
  product: { name: string; price: number } | null;
  currency: string;
  offers: { id: string; name: string; quantity: number; freeQuantity: number; price: number; compareAtPrice?: number | null; isDefault?: boolean }[];
}

/** A palette the seller can start from instead of hunting for a hex. */
const SWATCHES = [
  '#b8256e', '#e11d48', '#ea580c', '#f59e0b',
  '#16a34a', '#0d9488', '#2563eb', '#4f46e5',
  '#7c3aed', '#0f172a', '#8b5a2b', '#be123c',
];

export function BlockBuilder(props: Props) {
  const { theme, sections, onTheme, onSections } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  /**
   * A look copied off one block, waiting to be put on another.
   *
   * Kept in memory and not saved: it is a clipboard, and a clipboard that
   * survives a reload is a clipboard nobody remembers filling.
   */
  const [copiedLook, setCopiedLook] = useState<LandingSection['look'] | null>(null);

  /**
   * How large the page is drawn, NOT how large it is.
   *
   * A seller checking their spacing wants to see the whole page at once;
   * one reading their own small print wants it bigger. Neither is a change
   * to the page, so this is a transform on the canvas and touches nothing
   * that gets saved.
   */
  const [zoom, setZoom] = useState(1);

  /** Whether the template list is open. Never saved — it is a menu. */
  const [pickingTemplate, setPickingTemplate] = useState(false);

  const confirm = useConfirm();

  const palette = useMemo(() => paletteFor(theme), [theme]);
  // The page's own faces, in full, exactly as the published page asks for
  // them — a preview whose headings synthesise their bold is not a preview.
  const fontLink = useMemo(
    () => fontHref(theme.font, ...sections.map((b) => b.look?.text?.font)),
    [theme.font, sections]
  );
  // And the whole library at one weight, for the picker's specimen list. A
  // list of twenty names in the fallback face is worse than no list; every
  // weight of twenty families to draw twenty words is worse than that.
  const specimenLink = useMemo(() => specimenHref(...FONTS.map((f) => f.key)), []);

  // The store's own uploaded faces. Fetched rather than passed in, because
  // the uploader below can add one without the page being rebuilt — and a
  // font you just uploaded that does not appear until a reload reads as
  // an upload that failed.
  const [storeFonts, setStoreFonts] = useState<StoreFontRow[]>([]);
  const storeFontCss = useMemo(() => {
    if (storeFonts.length === 0) return '';
    const faces = storeFonts
      .map(
        (f) =>
          `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(f.url)}) format(${JSON.stringify(f.format)});font-weight:${f.weight};font-style:${f.italic ? 'italic' : 'normal'};font-display:swap;}`
      )
      .join('\n');
    // Same variable mapping the published page emits, so `u:<key>` resolves
    // identically in the preview and in the page it is previewing.
    const seen = new Set<string>();
    const vars = storeFonts
      .filter((f) => !seen.has(f.key) && seen.add(f.key))
      .map((f) => `--lp-uf-${f.key}: ${JSON.stringify(f.family)}, system-ui, sans-serif;`)
      .join(' ');
    return `${faces}
.lp-root, .zaki-font-panel { ${vars} }`;
  }, [storeFonts]);

  // One list for the pickers: the library, then whatever this store uploaded.
  const fontChoices = useMemo(() => {
    const uploaded = new Map<string, { key: FontValue; label: string; stack: string; note: string }>();
    for (const f of storeFonts) {
      if (uploaded.has(f.key)) continue;
      uploaded.set(f.key, {
        key: `u:${f.key}` as FontValue,
        label: f.label,
        stack: `"${f.family}", system-ui, sans-serif`,
        note: 'خطّك',
      });
    }
    return [
      ...FONTS.map((f) => ({ key: f.key as FontValue, label: f.label, stack: f.stack, note: f.note })),
      ...uploaded.values(),
    ];
  }, [storeFonts]);

  const patch = (id: string, fields: Record<string, unknown>) =>
    onSections(sections.map((s) => (s.id === id ? ({ ...s, ...fields } as LandingSection) : s)));

  /**
   * Reordering by dragging, with the keyboard as an equal.
   *
   * The arrows are gone: nudging a block from the bottom to the top was
   * eleven clicks, and each one re-rendered the page under the cursor so
   * the next arrow had moved. Dragging says what you mean in one gesture.
   *
   * `moveTo` is a LIFT AND INSERT, not a swap. Swapping neighbours is fine
   * for one step and wrong for a drag: dropping block 8 onto position 2
   * should slide 2–7 down, not trade 8 with 2 and scramble the middle.
   */
  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [lifted] = next.splice(from, 1);
    next.splice(to, 0, lifted);
    onSections(next);
  };

  /** Which row is under the cursor right now, for the drop line. */
  /** Each block's row in the side list, so a click on the page can reach it. */
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  /**
   * The preview surface, held in STATE rather than a ref.
   *
   * A ref's `.current` is read while rendering, and on the first render it
   * is still null — attaching it does not cause another render, so the hook
   * below would have run once against nothing and never again. A callback
   * ref that sets state re-runs it the moment the element exists.
   */
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);

  /** The block whose look the bar above the page is editing. */
  const openBlock = sections.find((b) => b.id === openId) ?? null;

  /**
   * Typing on the page instead of in the panel beside it.
   *
   * Only inside the selected block, and only on the texts the seller
   * writes — a price read from the catalogue is not his to type over.
   */
  /**
   * Writes a typed value back, by PATH.
   *
   * Most texts are a field — "headline". The ones inside a list are not:
   * the third benefit's title is `items.2.title`, and naming only the
   * field would have left every repeated text uneditable, which is most of
   * the words on a real page.
   *
   * Immutably, one level at a time, so React sees the change.
   */
  const commitText = useCallback(
    (id: string, path: string, value: string) => {
      const keys = path.split('.');
      if (keys.length === 1) return patch(id, { [path]: value });

      const block = sections.find((b) => b.id === id) as Record<string, unknown> | undefined;
      if (!block) return;

      const write = (node: unknown, depth: number): unknown => {
        const key = keys[depth];
        const last = depth === keys.length - 1;
        if (Array.isArray(node)) {
          const i = Number(key);
          if (!Number.isInteger(i) || i < 0 || i >= node.length) return node;
          const copy = [...node];
          copy[i] = last ? value : write(copy[i], depth + 1);
          return copy;
        }
        if (node && typeof node === 'object') {
          const o = node as Record<string, unknown>;
          return { ...o, [key]: last ? value : write(o[key], depth + 1) };
        }
        return node;
      };

      patch(id, { [keys[0]]: write(block[keys[0]], 1) });
    },
    // `patch` closes over `sections`, so this must follow them — a stale
    // one would write the edit onto the list as it was before the last one.
    [sections] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useInlineEdit(canvas, openId, commitText);

  /**
   * Reading a field back after the toolbar has changed its markup.
   *
   * The toolbar edits the DOM directly — that is what a selection toolbar
   * is — so React has no idea anything happened, and this commits the
   * field's current markup by the same path a blur takes.
   *
   * It is HANDED the element. Looking it up here meant asking which field
   * was selected just after the toolbar had cleared the selection, and the
   * answer was "none": bold happened to survive because the node still had
   * focus, and a colour applied after a re-render was committed nowhere.
   */
  const commitSelection = useCallback(
    (node: HTMLElement) => {
      const field = node.dataset.edit;
      if (field && openId) commitText(openId, field, sanitizeRich(node.innerHTML));
    },
    [openId, commitText]
  );

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const available = (Object.keys(SECTION_LABEL) as SectionType[]).filter(
    (t) => !(SINGLETON.includes(t) && sections.some((s) => s.type === t))
  );

  return (
    <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[340px_1fr]" dir="rtl">
      {/* Loaded for the panel, not for the page: the picker's names are
          drawn in their own faces and the preview must not be the only
          place a font appears. */}
      {specimenLink && <link rel="stylesheet" href={specimenLink} />}
      {/* Above the words the seller just highlighted, not docked in a
          panel they would have to look away to find. */}
      <SelectionBar root={canvas} fonts={fontChoices} onChange={commitSelection} />
      {/* Declared at the top so the PANEL can draw its specimens in them
          too, not only the preview below. */}
      {storeFontCss && <style dangerouslySetInnerHTML={{ __html: storeFontCss }} />}
      {/* ─── Controls ─── */}
      <div className="space-y-3">
        {/*
          FIRST, not buried.

          It sat at the bottom of the identity panel — 1184px down, past
          the colour, the mood, the font, the corners, the page background
          and the font uploader. Which is backwards: you pick a template
          and THEN adjust what it gave you, so a seller starting a page had
          to scroll past every decision the template was about to make for
          them before finding the thing that makes them.
        */}
        <div className="rounded-xl border border-[#e3e8ef] bg-white p-3">
          {/*
            A blank builder is a worse problem than a badly designed page:
            a seller who does not know which blocks a page needs picks
            three, publishes, and wonders why it does not sell.

            Offered as a BUTTON and not as an empty state. The first
            version showed these only when the page had no blocks — and a
            page never has none, because it always keeps its form and a new
            page is created from the starter set. A panel that can never
            appear is worse than no panel: it looks finished.

            Replacing a page is destructive, so it asks first, and says how
            much it is about to throw away.
          */}
          <button
            type="button"
            onClick={() => setPickingTemplate((v) => !v)}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#c9d2e0] px-2 py-1.5 text-[11px] font-semibold text-[#697586] transition hover:border-[#b8256e] hover:text-[#b8256e]"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            {pickingTemplate ? 'إغلاق القوالب' : 'ابدأ من قالب جاهز'}
          </button>

          {pickingTemplate && (
            <div className="mb-3 max-h-80 space-y-1.5 overflow-y-auto rounded-lg bg-[#f8fafc] p-2">
              <p className="text-[10px] leading-relaxed text-[#697586]">
                القالب يستبدل أقسام الصفحة الحالية. النصوص والصور التي كتبتها ستُفقد.
              </p>
              {PAGE_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={async () => {
                    const built = buildTemplate(t.key);
                    const ok = await confirm({
                      title: `استبدال الصفحة بـ«${t.label}»؟`,
                      body:
                        sections.length > 0
                          ? `سيُحذف ${sections.length} قسماً بما فيها من نصوص وصور، ويحل محلها ${built.sections.length} قسماً جديداً بلون وخط القالب.`
                          : undefined,
                      confirmLabel: 'استبدل',
                      cancelLabel: 'إلغاء',
                      tone: 'danger',
                    });
                    if (!ok) return;
                    // The theme as well as the blocks: a template that only
                    // changed the order would be the same page five times,
                    // which is the version of this feature nobody uses.
                    onTheme(built.theme);
                    onSections(built.sections);
                    setPickingTemplate(false);
                    setOpenId(null);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg border border-[#e3e8ef] bg-white px-2.5 py-2 text-start transition hover:border-[#b8256e] hover:bg-[#fdf2f7]"
                >
                  {/* Its own colour, so fifteen rows are scannable without
                      reading fifteen names. */}
                  <span
                    className="mt-0.5 h-7 w-1.5 shrink-0 rounded-full"
                    style={{ background: t.swatch }}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[#364152]">{t.label}</span>
                    <span className="block text-[9.5px] leading-relaxed text-[#9aa4b2]">{t.hint}</span>
                    <span className="mt-0.5 block text-[9px] text-[#c9d2e0]">{t.bricks.length} أقسام</span>
                  </span>
                </button>
              ))}
            </div>
          )}

        </div>

        {/* Theme */}
        <div className="rounded-xl border border-[#e3e8ef] bg-white p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#697586]">الهوية</p>

          <label className="mb-1.5 block text-xs font-semibold text-[#364152]">اللون الأساسي</label>
          <div className="mb-2 grid grid-cols-6 gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onTheme({ ...theme, accent: hex })}
                title={hex}
                style={{ background: hex }}
                className={`h-7 rounded-md border-2 transition ${
                  theme.accent.toLowerCase() === hex ? 'border-[#121926] scale-105' : 'border-transparent'
                }`}
              />
            ))}
          </div>
          <div className="mb-4 flex items-center gap-2">
            <input
              type="color"
              value={isValidHex(theme.accent) ? theme.accent : DEFAULT_THEME.accent}
              onChange={(e) => onTheme({ ...theme, accent: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-[#e3e8ef]"
            />
            <Input
              dir="ltr"
              value={theme.accent}
              onChange={(e) => onTheme({ ...theme, accent: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
          <p className="-mt-3 mb-4 text-[10px] leading-relaxed text-[#9aa4b2]">
            كل باقي الألوان — الزر، السعر، الشارات، الحدود — تُشتق من هذا اللون، فلا يمكن أن تتنافر.
          </p>

          <label className="mb-1.5 block text-xs font-semibold text-[#364152]">الطابع</label>
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onTheme({ ...theme, mood: m.key })}
                className={`rounded-lg border px-2 py-1.5 text-start text-[11px] transition ${
                  theme.mood === m.key
                    ? 'border-[#b8256e] bg-[#fdf2f7] font-bold text-[#b8256e]'
                    : 'border-[#e3e8ef] text-[#364152] hover:border-[#b8256e]/40'
                }`}
              >
                {m.label}
                <span className="block text-[9px] font-normal text-[#9aa4b2]">{m.hint}</span>
              </button>
            ))}
          </div>

          <label className="mb-1.5 block text-xs font-semibold text-[#364152]">الخط</label>
          {/*
            A specimen list, not a list of names: every face is drawn in
            itself, because "لاله زار" tells a seller nothing and the shape
            of the letters tells them everything. Thirteen of them scroll
            rather than push the rest of the panel off the screen.
          */}
          <div className="mb-4 max-h-56 space-y-1 overflow-y-auto pe-1">
            {fontChoices.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onTheme({ ...theme, font: f.key })}
                className={`flex w-full items-baseline justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-start transition ${
                  theme.font === f.key
                    ? 'border-[#b8256e] bg-[#fdf2f7] text-[#b8256e]'
                    : 'border-[#e3e8ef] text-[#364152] hover:border-[#b8256e]/40'
                }`}
              >
                <span className="text-[15px] leading-tight" style={{ fontFamily: f.stack }}>
                  {f.label}
                </span>
                <span className="shrink-0 text-[9px] text-[#9aa4b2]">{f.note}</span>
              </button>
            ))}
          </div>

          {/* The seller's own typefaces, beneath the library — a brand that
              bought a font should not have to settle for the nearest free
              one. Uploading is per store, like everything a store owns. */}
          <div className="mb-4 border-t border-[#f1f3f6] pt-3">
            <FontUploader onChanged={setStoreFonts} />
          </div>

          <label className="mb-1.5 block text-xs font-semibold text-[#364152]">الزوايا</label>
          <div className="grid grid-cols-2 gap-1.5">
            {([['soft', 'ناعمة'], ['sharp', 'حادّة']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => onTheme({ ...theme, corners: k })}
                className={`rounded-lg border px-2 py-1.5 text-[11px] transition ${
                  theme.corners === k
                    ? 'border-[#b8256e] bg-[#fdf2f7] font-bold text-[#b8256e]'
                    : 'border-[#e3e8ef] text-[#364152] hover:border-[#b8256e]/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/*
            The page's own backdrop. It belongs to the theme and not to a
            block, because a seller who wants a textured page means the
            page — setting the same photograph on nine blocks and keeping
            them in step is not a feature, it is a chore.
          */}
          <div className="mt-4 border-t border-[#f1f3f6] pt-3">
            <ImageField
              label="خلفية الصفحة كلها"
              value={theme.pageImage ?? ''}
              onChange={(v) => onTheme({ ...theme, pageImage: v })}
              onUpload={props.onUpload}
            />
            {theme.pageImage ? (
              <div className="mt-2">
                <label className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#697586]">
                  <span>تغطية الصورة</span>
                  <span className="tabular-nums">{Math.round((theme.pageVeil ?? 0.82) * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.95}
                  step={0.05}
                  value={theme.pageVeil ?? 0.82}
                  onChange={(e) => onTheme({ ...theme, pageVeil: Number(e.target.value) })}
                  className="w-full accent-[#b8256e]"
                />
                {/* Not decoration. Body text straight on a photograph is
                    unreadable exactly as often as the photograph is busy,
                    and the seller is looking at the picture, not the text. */}
                <p className="mt-1 text-[10px] leading-relaxed text-[#9aa4b2]">
                  كل ما زادت، صار النص أوضح والصورة أخفت. تحت ٥٠٪ غالباً بتصير القراءة صعبة.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Sections */}
        <div className="rounded-xl border border-[#e3e8ef] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#697586]">أقسام الصفحة</p>
            <span className="text-[10px] text-[#9aa4b2]">{sections.length}</span>
          </div>

          <ul className="space-y-1.5">
            {sections.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => { rowRefs.current[s.id] = el; }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) moveTo(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={`rounded-lg border transition-colors ${
                  dragFrom === i
                    ? 'border-[#b8256e] opacity-40'
                    : dragOver === i && dragFrom !== null
                      ? 'border-[#b8256e] bg-[#fdf5fa]'
                      : 'border-[#e3e8ef]'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  {/* The handle, not the whole row: a row that drags from
                      anywhere cannot also have buttons you click. */}
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(i);
                      e.dataTransfer.effectAllowed = 'move';
                      // Firefox refuses to start a drag without payload.
                      e.dataTransfer.setData('text/plain', s.id);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onKeyDown={(e) => {
                      // The keyboard is not a lesser way to do this.
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        moveTo(i, i - 1);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        moveTo(i, i + 1);
                      }
                    }}
                    title="اسحب لترتيب البلوك — أو الأسهم من لوحة المفاتيح"
                    aria-label={`رتّب ${SECTION_LABEL[s.type]}`}
                    className="cursor-grab active:cursor-grabbing p-0.5 text-[#c3c8d4] hover:text-[#b8256e] focus:outline-none focus:text-[#b8256e]"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenId(openId === s.id ? null : s.id)}
                    className="flex-1 cursor-pointer text-start"
                  >
                    <span className={`text-xs font-bold ${s.enabled ? 'text-[#121926]' : 'text-[#9aa4b2] line-through'}`}>
                      {SECTION_LABEL[s.type]}
                    </span>
                    <span className="block text-[9.5px] text-[#9aa4b2]">{SECTION_HINT[s.type]}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => patch(s.id, { enabled: !s.enabled })}
                    title={s.enabled ? 'إخفاء' : 'إظهار'}
                    className="cursor-pointer p-1 text-[#697586] hover:text-[#b8256e]"
                  >
                    {s.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  {/* The form is what makes this a landing page; it can be
                      moved but not removed. */}
                  {s.type !== 'form' && (
                    <button
                      type="button"
                      onClick={() => {
                        onSections(sections.filter((x) => x.id !== s.id));
                        if (openId === s.id) setOpenId(null);
                      }}
                      title="حذف"
                      className="cursor-pointer p-1 text-[#9aa4b2] hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {openId === s.id && (
                  <div className="space-y-2 border-t border-[#e3e8ef] bg-[#f8fafc] p-3">
                    <SectionFields section={s} patch={(f) => patch(s.id, f)} onUpload={props.onUpload} />

                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="relative mt-3">
            <Button variant="outline" size="sm" className="w-full" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-3.5 w-3.5" /> إضافة قسم
            </Button>
            {adding && (
              <div className="absolute bottom-full z-20 mb-1 max-h-72 w-full overflow-auto rounded-lg border border-[#e3e8ef] bg-white py-1 shadow-lg">
                {available.length === 0 && (
                  <p className="px-3 py-2 text-[11px] text-[#9aa4b2]">كل الأقسام مضافة.</p>
                )}
                {available.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const s = newSection(t);
                      onSections([...sections, s]);
                      setOpenId(s.id);
                      setAdding(false);
                    }}
                    className="block w-full cursor-pointer px-3 py-1.5 text-start hover:bg-[#f8fafc]"
                  >
                    <span className="text-xs font-semibold text-[#364152]">{SECTION_LABEL[t]}</span>
                    <span className="block text-[9.5px] text-[#9aa4b2]">{SECTION_HINT[t]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Live preview, drawn by the public renderer ─── */}
      <div className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-[#e3e8ef] bg-white">
        <div className="flex items-center justify-between border-b border-[#e3e8ef] px-3 py-2">
          <span className="text-xs font-semibold text-[#364152]">معاينة مباشرة</span>
          <div className="flex items-center gap-1">
            {/* How large the page is DRAWN, not how large it is. Checking
                the spacing of a long page means seeing the whole of it;
                reading your own small print means the opposite. Neither is
                a change to the page. */}
            <button
              type="button"
              title="تصغير المعاينة"
              disabled={zoom <= 0.5}
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              className="cursor-pointer rounded p-1.5 text-[#697586] hover:bg-[#f8fafc] disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="حجم طبيعي"
              onClick={() => setZoom(1)}
              className="min-w-[2.75rem] cursor-pointer rounded px-1 py-1 text-[11px] font-semibold tabular-nums text-[#697586] hover:bg-[#f8fafc]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              title="تكبير المعاينة"
              disabled={zoom >= 1.5}
              onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}
              className="cursor-pointer rounded p-1.5 text-[#697586] hover:bg-[#f8fafc] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="mx-1 h-4 w-px bg-[#e3e8ef]" />
            {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={`cursor-pointer rounded p-1.5 ${
                  device === d ? 'bg-[#fdf2f7] text-[#b8256e]' : 'text-[#697586] hover:bg-[#f8fafc]'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {/*
          The transform lives on the SCROLLER, not on the page inside it.
          `position: fixed` resolves against the nearest transformed
          ancestor's box — and when that was the page itself, which is as
          tall as all its blocks, the floating button sat at the bottom of
          the whole page instead of floating above what the seller was
          looking at. It was called "the floating button" and it did not
          float. The scroller's box IS the visible area, so the button now
          behaves here exactly as it does on a phone.
        */}
        <div
          className="flex flex-1 justify-center overflow-auto bg-[#eef2f6] p-3"
          style={{ transform: 'translateZ(0)' }}
        >
          <div
            ref={setCanvas}
            className="lp-root overflow-hidden rounded-lg border border-[#e3e8ef] shadow-sm"
            dir="rtl"
            style={{
              ...(paletteVars(palette) as React.CSSProperties),
              width: device === 'mobile' ? 390 : '100%',
              maxWidth: '100%',
              // `zoom` and not `transform: scale`: scale leaves the element
              // claiming its old size, so the scroller keeps the space a
              // shrunk page no longer uses and clips a magnified one.
              zoom,
            }}
          >
            {/* The preview loads the same families the published page
                will. Without this a chosen font fell back to the system
                stack HERE and looked like the picker doing nothing. */}
            {fontLink && <link rel="stylesheet" href={fontLink} />}
            <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS_WITH_DEV_FONTS }} />
            <PageBlocks
              sections={sections}
              /**
               * Touch the block on the page to edit it.
               *
               * Hunting for a row in a list of eighteen, to change the thing
               * already under the cursor, is the step this removes. Passed
               * only here: the published page gets the same renderer with
               * no selection, so it carries no outlines and no listeners.
               */
              selection={{
                activeId: openId,
                label: (s) => SECTION_LABEL[s.type],
                // Just select it. This used to also scroll the side list to
                // that block's row — and since the controls moved onto the
                // block, all that scroll did was yank the page away from the
                // thing just clicked.
                onSelect: setOpenId,
                onMove: (id, by) => {
                  const i = sections.findIndex((x) => x.id === id);
                  if (i >= 0) moveTo(i, i + by);
                },
                onToggle: (id) => {
                  const b = sections.find((x) => x.id === id);
                  if (b) patch(id, { enabled: !b.enabled });
                },
                onRemove: (id) => onSections(sections.filter((x) => x.id !== id)),
                /**
                 * The look controls ride in the block's own bar.
                 *
                 * A strip pinned to the top of the editor scrolled out of
                 * sight the moment the page did — so styling a block
                 * halfway down meant scrolling back up to reach it. Here it
                 * is attached to what it changes and cannot go missing.
                 */
                toolbar: (b) => (
                  <LookControls
                    look={b.look}
                    onChange={(look) => patch(b.id, { look })}
                    onUpload={async (file) => {
                      // The builder's uploader takes a FileList; a
                      // background is one picture, so wrap it rather than
                      // growing a second uploader beside it.
                      const dt = new DataTransfer();
                      dt.items.add(file);
                      const urls = await props.onUpload(dt.files);
                      return urls[0] ?? null;
                    }}
                  />
                ),
                onEdit: (id) => {
                  setOpenId(id);
                  requestAnimationFrame(() =>
                    rowRefs.current[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                  );
                },
                /**
                 * Copy a look, paste it onto the next block.
                 *
                 * Matching two blocks by hand is eight controls set twice
                 * and a third block that never quite matches. This is the
                 * same look object, so they cannot drift.
                 */
                onCopyLook: (id) => {
                  const b = sections.find((x) => x.id === id);
                  if (b) setCopiedLook(b.look);
                },
                onPasteLook: (id) => {
                  if (copiedLook) patch(id, { look: copiedLook });
                },
                hasCopiedLook: Boolean(copiedLook),
                canDuplicate: (b) => !SINGLETON.includes(b.type),
                onDuplicate: (id) => {
                  const i = sections.findIndex((x) => x.id === id);
                  if (i < 0) return;
                  /**
                   * A copy directly below, carrying everything — content AND
                   * look. Placing it at the end would mean dragging it back
                   * past everything, which is the work this saves.
                   *
                   * A fresh id, because two blocks sharing one would edit and
                   * delete as a pair without saying so.
                   */
                  const copy = {
                    ...structuredClone(sections[i]),
                    id: `${sections[i].type}-${Date.now().toString(36)}`,
                  } as LandingSection;
                  const next = [...sections];
                  next.splice(i + 1, 0, copy);
                  onSections(next);
                  setOpenId(copy.id);
                },
              }}
              ctx={{
                palette,
                productName: props.product?.name || 'اسم المنتج',
                price: props.product?.price ?? 0,
                currency: props.currency,
                stock: 7, // a plausible figure so the block can be judged
                offers: props.offers,
                form: <FormPlaceholder />,
                building: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stands in for the real order form: the preview must never take an order. */
function FormPlaceholder() {
  return (
    <div
      style={{
        border: '2px dashed var(--lp-accent-border)',
        borderRadius: 'var(--lp-radius)',
        padding: '28px 16px',
        textAlign: 'center',
        background: 'var(--lp-accent-tint)',
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--lp-accent)' }}>نموذج الطلب</p>
      <p style={{ fontSize: 11.5, color: 'var(--lp-muted)', marginTop: 4 }}>
        الاسم، الهاتف، المحافظة، العنوان — يظهر كاملاً في الصفحة المنشورة
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Per-block fields
// ─────────────────────────────────────────────────────

function SectionFields({
  section: s, patch, onUpload,
}: {
  section: LandingSection;
  patch: (fields: Record<string, unknown>) => void;
  onUpload: (files: FileList) => Promise<string[]>;
}) {
  switch (s.type) {
    case 'announcement':
      return <Field label="النص" value={s.text} onChange={(v) => patch({ text: v })} />;

    case 'hero':
      return (
        <div className="space-y-2.5">
          <ImageField
            label="صورة الواجهة"
            value={s.image}
            onChange={(v) => patch({ image: v })}
            onUpload={onUpload}
          />
          <Field label="العنوان" value={s.headline} onChange={(v) => patch({ headline: v })} placeholder="فارغ = اسم المنتج" />
          <Field label="سطر الوصف" value={s.subheadline} onChange={(v) => patch({ subheadline: v })} area />
          <Field label="نص الزر" value={s.ctaText} onChange={(v) => patch({ ctaText: v })} />
          <Check label="إظهار السعر" checked={s.showPrice} onChange={(v) => patch({ showPrice: v })} />
        </div>
      );

    case 'benefits':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <Repeater
            items={s.items}
            max={8}
            blank={{ title: '', text: '' }}
            onChange={(items) => patch({ items })}
            render={(item, set) => (
              <>
                <Field label="الميزة" value={item.title} onChange={(v) => set({ ...item, title: v })} />
                <Field label="شرح" value={item.text} onChange={(v) => set({ ...item, text: v })} />
              </>
            )}
          />
        </div>
      );

    case 'gallery':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <GalleryField images={s.images} onChange={(images) => patch({ images })} onUpload={onUpload} />
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} placeholder="اختياري" />
          <GalleryField images={s.images} onChange={(images) => patch({ images: images.slice(0, 10) })} onUpload={onUpload} />
          <Check label="تتقلّب وحدها" checked={s.autoplay} onChange={(v) => patch({ autoplay: v })} />
          {s.autoplay && (
            <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#364152]">
              ثوانٍ لكل صورة
              <select
                value={s.seconds}
                onChange={(e) => patch({ seconds: Number(e.target.value) })}
                className="h-8 rounded-md border border-[#e3e8ef] bg-white px-2 text-xs"
              >
                {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <p className="text-[10px] leading-relaxed text-[#697586]">
            حتى ١٠ صور. تتوقف حين يلمسها الزائر، ولا تتقلّب أبداً لمن طلب من جهازه حركة أقل.
          </p>
        </div>
      );

    case 'thankyou':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <Field label="الرسالة" value={s.message} onChange={(v) => patch({ message: v })} area rows={4} />
          <p className="text-[10px] leading-relaxed text-[#697586]">
            تظهر مكان النموذج بعد إرسال الطلب. رقم الطلب وعروض ما بعد الطلب تظهر تحتها تلقائياً —
            لا تكتبها هنا.
          </p>
        </div>
      );

    case 'text':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <Field label="النص" value={s.body} onChange={(v) => patch({ body: v })} area rows={6} />
        </div>
      );

    case 'offers':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <p className="text-[10px] leading-relaxed text-[#697586]">
            العروض نفسها تُدار من تبويب «العروض» في الصفحة — الأسعار تأتي من هناك،
            ولا تُكتب هنا، حتى لا يكون للسعر مصدران.
          </p>
        </div>
      );

    case 'reviews':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <Repeater
            items={s.items}
            max={12}
            blank={{ name: '', text: '', stars: 5 }}
            onChange={(items) => patch({ items })}
            render={(item, set) => (
              <>
                <Field label="الاسم" value={item.name} onChange={(v) => set({ ...item, name: v })} />
                <Field label="الرأي" value={item.text} onChange={(v) => set({ ...item, text: v })} area />
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-[#697586]">النجوم</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => set({ ...item, stars: n })}
                        className={`h-6 w-6 cursor-pointer rounded text-xs ${
                          n <= item.stars ? 'bg-[#b8256e] text-white' : 'bg-white text-[#9aa4b2] border border-[#e3e8ef]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          />
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <Repeater
            items={s.items}
            max={12}
            blank={{ q: '', a: '' }}
            onChange={(items) => patch({ items })}
            render={(item, set) => (
              <>
                <Field label="السؤال" value={item.q} onChange={(v) => set({ ...item, q: v })} />
                <Field label="الجواب" value={item.a} onChange={(v) => set({ ...item, a: v })} area />
              </>
            )}
          />
        </div>
      );

    case 'urgency':
      return (
        <div className="space-y-2.5">
          <Field label="الملاحظة" value={s.text} onChange={(v) => patch({ text: v })} placeholder="العرض ساري اليوم فقط" />
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-[#697586]">عدّاد (دقائق، 0 = بلا عدّاد)</label>
            <Input
              type="number" min="0" max="1440" dir="ltr"
              value={s.minutes}
              onChange={(e) => patch({ minutes: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) })}
              className="text-xs"
            />
          </div>
          <Check
            label="إظهار المخزون المتبقي الحقيقي"
            checked={s.showRealStock}
            onChange={(v) => patch({ showRealStock: v })}
          />
          <p className="text-[10px] leading-relaxed text-[#697586]">
            الرقم يُقرأ من المخزون الفعلي ولا يظهر إلا إذا كان منخفضاً حقاً — لا يوجد حقل
            لكتابة «بقي ٣» بينما المخزون مئة.
          </p>
        </div>
      );

    case 'form':
      return (
        <div className="space-y-2.5">
          <Field label="العنوان" value={s.title} onChange={(v) => patch({ title: v })} />
          <Field label="سطر تحته" value={s.subtitle} onChange={(v) => patch({ subtitle: v })} />
        </div>
      );

    case 'trust':
      return (
        <Repeater
          items={s.items}
          max={4}
          blank={{ title: '', text: '' }}
          onChange={(items) => patch({ items })}
          render={(item, set) => (
            <>
              <Field label="الضمان" value={item.title} onChange={(v) => set({ ...item, title: v })} />
              <Field label="سطر صغير" value={item.text} onChange={(v) => set({ ...item, text: v })} />
            </>
          )}
        />
      );

    case 'footer':
      return (
        <div className="space-y-2.5">
          <ImageField label="الشعار" value={s.logo} onChange={(v) => patch({ logo: v })} onUpload={onUpload} />
          <Field label="نص التذييل" value={s.text} onChange={(v) => patch({ text: v })} placeholder="جميع الحقوق محفوظة" />
          <Field label="رقم للتواصل" value={s.phone} onChange={(v) => patch({ phone: v })} />

          <div>
            <label className="mb-1 block text-[10px] font-semibold text-[#697586]">أعمدة الروابط</label>
            <Repeater
              items={s.columns}
              max={4}
              blank={{ title: '', links: [{ label: '', url: '' }] }}
              onChange={(columns) => patch({ columns })}
              render={(col, set) => (
                <>
                  <Field label="عنوان العمود" value={col.title} onChange={(v) => set({ ...col, title: v })} />
                  <Repeater
                    items={col.links}
                    max={8}
                    blank={{ label: '', url: '' }}
                    onChange={(links) => set({ ...col, links })}
                    render={(link, setLink) => (
                      <>
                        <Field label="اسم الرابط" value={link.label} onChange={(v) => setLink({ ...link, label: v })} />
                        <LinkField value={link.url} onChange={(v) => setLink({ ...link, url: v })} />
                      </>
                    )}
                  />
                </>
              )}
            />
          </div>
        </div>
      );

    case 'sticky':
      return (
        <div className="space-y-2.5">
          <Field label="نص الزر" value={s.text} onChange={(v) => patch({ text: v })} />
          <Check label="إظهار السعر على الزر" checked={s.showPrice} onChange={(v) => patch({ showPrice: v })} />
          <p className="text-[10px] leading-relaxed text-[#697586]">
            يلاحق الزائر أسفل الشاشة، وبالضغط عليه ينزل مباشرة إلى تعبئة البيانات.
            موقعه في الترتيب لا يغيّر شيئاً — هو مثبّت على الشاشة لا على الصفحة.
          </p>
        </div>
      );
  }
}

/**
 * A URL field that says what is wrong while it is being typed.
 *
 * The same rule the schema enforces, shown before the save fails: an http(s)
 * address, a path on this site, or a phone/mail link. `javascript:` is the
 * one that turns a footer link into a script on a public page.
 */
function LinkField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ok = value === '' || /^https?:\/\//i.test(value) || /^\/[^/]/.test(value) || /^(mailto|tel):/i.test(value);
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold text-[#697586]">الرابط</label>
      <Input
        dir="ltr"
        value={value}
        placeholder="https://… أو /page"
        onChange={(e) => onChange(e.target.value)}
        className={`text-xs ${ok ? '' : 'border-rose-400'}`}
      />
      {!ok && <p className="mt-1 text-[10px] text-rose-600">رابط غير صالح — يبدأ بـ https:// أو /</p>}
    </div>
  );
}

function Field({
  label, value, onChange, area, rows = 3, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold text-[#697586]">{label}</label>
      {area ? (
        <textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-y rounded-lg border border-[#e3e8ef] bg-white px-2.5 py-1.5 text-xs text-[#121926] outline-none focus:border-[#b8256e]"
        />
      ) : (
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="text-xs" />
      )}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#364152]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-[#b8256e]"
      />
      {label}
    </label>
  );
}

function ImageField({
  label, value, onChange, onUpload,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onUpload: (files: FileList) => Promise<string[]>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls = await onUpload(files);
      if (urls[0]) onChange(urls[0]);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold text-[#697586]">{label}</label>
      {value ? (
        <div className="relative mb-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-28 w-full rounded-lg border border-[#e3e8ef] object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute left-1.5 top-1.5 cursor-pointer rounded-full bg-white/90 p-1 text-[#697586] hover:text-rose-600"
            title="إزالة"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <Button variant="outline" size="sm" className="w-full" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {value ? 'تغيير الصورة' : 'رفع صورة'}
      </Button>
    </div>
  );
}

function GalleryField({
  images, onChange, onUpload,
}: {
  images: string[];
  onChange: (v: string[]) => void;
  onUpload: (files: FileList) => Promise<string[]>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls = await onUpload(files);
      if (urls.length) onChange([...images, ...urls].slice(0, 12));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div>
      {images.length > 0 && (
        <div className="mb-1.5 grid grid-cols-3 gap-1.5">
          {images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-square w-full rounded-md border border-[#e3e8ef] object-cover" />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, n) => n !== i))}
                className="absolute left-0.5 top-0.5 cursor-pointer rounded-full bg-white/90 p-0.5 text-[#697586] hover:text-rose-600"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      <Button variant="outline" size="sm" className="w-full" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} إضافة صور
      </Button>
    </div>
  );
}

/** A list of small records with add/remove, used by benefits, reviews, faq, trust. */
function Repeater<T>({
  items, max, blank, onChange, render,
}: {
  items: T[];
  max: number;
  blank: T;
  onChange: (items: T[]) => void;
  render: (item: T, set: (v: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="relative space-y-2 rounded-lg border border-[#e3e8ef] bg-white p-2.5">
          <button
            type="button"
            onClick={() => onChange(items.filter((_, n) => n !== i))}
            className="absolute left-1.5 top-1.5 cursor-pointer text-[#9aa4b2] hover:text-rose-600"
            title="حذف"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {render(item, (v) => onChange(items.map((x, n) => (n === i ? v : x))))}
        </div>
      ))}
      {items.length < max && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([...items, blank])}>
          <Plus className="h-3 w-3" /> إضافة
        </Button>
      )}
    </div>
  );
}
