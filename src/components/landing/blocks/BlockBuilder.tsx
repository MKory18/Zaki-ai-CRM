'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Eye, EyeOff, Trash2, Plus, Upload, Loader2, GripVertical,
  Monitor, Smartphone, X, Paintbrush,
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
  type LandingTheme, DEFAULT_THEME, MOODS, FONTS, paletteFor, paletteVars, isValidHex,
} from '@/lib/landing-theme';
import { PageBlocks } from './PageBlocks';
import { BLOCK_CSS } from './styles';

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

  const palette = useMemo(() => paletteFor(theme), [theme]);

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

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const available = (Object.keys(SECTION_LABEL) as SectionType[]).filter(
    (t) => !(SINGLETON.includes(t) && sections.some((s) => s.type === t))
  );

  return (
    <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[340px_1fr]" dir="rtl">
      {/* ─── Controls ─── */}
      <div className="space-y-3">
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
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onTheme({ ...theme, font: f.key })}
                className={`rounded-lg border px-2 py-1.5 text-[11px] transition ${
                  theme.font === f.key
                    ? 'border-[#b8256e] bg-[#fdf2f7] font-bold text-[#b8256e]'
                    : 'border-[#e3e8ef] text-[#364152] hover:border-[#b8256e]/40'
                }`}
              >
                {f.label}
              </button>
            ))}
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

        <div className="flex flex-1 justify-center overflow-auto bg-[#eef2f6] p-3">
          <div
            ref={setCanvas}
            className="lp-root overflow-hidden rounded-lg border border-[#e3e8ef] shadow-sm"
            dir="rtl"
            style={{
              ...(paletteVars(palette) as React.CSSProperties),
              width: device === 'mobile' ? 390 : '100%',
              maxWidth: '100%',
              // Makes this box the containing block for `position: fixed`,
              // so the sticky button floats inside the preview instead of
              // over the dashboard the seller is standing in.
              transform: 'translateZ(0)',
            }}
          >
            <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS }} />
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
