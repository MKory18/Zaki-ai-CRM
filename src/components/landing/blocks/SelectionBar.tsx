'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, Highlighter, Eraser } from 'lucide-react';
import { MARK_COLORS, MARK_SIZES } from '@/lib/rich-text';
import type { FontValue } from '@/lib/landing-theme';

/**
 * PICK SOME WORDS, AND CHANGE THEM.
 *
 * The block panel styles a whole block, which is the right unit for almost
 * everything — but not for "عرض خاص **لفترة محدودة**", where the point is
 * that two words differ from the rest. Until now the only way to get that
 * was to split the sentence across two blocks, which reads as two blocks.
 *
 * So: select text inside a block you are editing, and this appears above
 * it. It is not a general rich-text editor. Every button writes one of the
 * marks `sanitizeRich` will accept, and the colours and sizes are indexes
 * into the theme's own lists — a seller cannot reach a colour the page was
 * not built from, which is the whole reason the pages look like pages.
 *
 * It positions itself over the selection rather than docking somewhere: a
 * toolbar you have to look away to find is a toolbar you stop using, and
 * the seller's eyes are on the words they just highlighted.
 */

export interface SelectionBarProps {
  /** The element the editable texts live inside; selections outside are ignored. */
  root: HTMLElement | null;
  /** Fonts available right now — the library plus this store's uploads. */
  fonts: { key: FontValue; label: string; stack: string }[];
  /**
   * Called after any change, with the field that changed.
   *
   * The FIELD is passed rather than left to be found, because this clears
   * the selection as part of applying a mark — and the first version then
   * asked "which field is selected?" of a document with nothing selected.
   * Bold survived because the element still had focus; a colour, applied
   * after a re-render had replaced that element, was committed nowhere and
   * vanished on the next render.
   */
  onChange: (field: HTMLElement) => void;
}

const CHIP =
  'flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition';
const OFF = 'text-[#e3e8ef] hover:bg-white/10 hover:text-white';
const ON = 'bg-white text-[#121926]';

export function SelectionBar({ root, fonts, onChange }: SelectionBarProps) {
  const [at, setAt] = useState<{ top: number; left: number; height: number; below: boolean } | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<'color' | 'size' | 'font' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  /** The editable host of the current selection, or null if it is elsewhere. */
  const hostOf = useCallback(
    (sel: Selection | null): HTMLElement | null => {
      if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const node = sel.anchorNode;
      if (!node) return null;
      const el = (node.nodeType === 1 ? node : node.parentNode) as HTMLElement | null;
      const host = el?.closest?.('[data-edit]') as HTMLElement | null;
      if (!host || !root.contains(host)) return null;
      // Only a field that is currently editable — the published page has the
      // attribute too, and a selection there must do nothing.
      if (host.getAttribute('contenteditable') === null) return null;
      return host;
    },
    [root]
  );

  const reposition = useCallback(() => {
    const sel = window.getSelection();
    const host = hostOf(sel);
    if (!host || !sel) {
      setAt(null);
      setOpen(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setAt(null);
      return;
    }
    // Viewport coordinates, with NO scroll added: the bar is `position:
    // fixed`, which is already relative to the viewport. Adding the scroll
    // offset put it one page-length too low — invisible the moment the
    // seller scrolled down to the block they were editing, which is every
    // block but the first. The toolbar appeared to work on a headline at
    // the top of the page and to do nothing anywhere else.
    // A selection close to the top of the window has nowhere to put a
    // toolbar above it. 96px is the bar at its tallest, with a colour row open.
    setAt({
      top: rect.top,
      left: rect.left + rect.width / 2,
      height: rect.height,
      below: rect.top < 96,
    });

    // What is already on, so the buttons read as toggles rather than as
    // switches that only go one way.
    const node = (sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentNode) as HTMLElement | null;
    const state: Record<string, boolean> = {};
    for (const tag of ['b', 'i', 'u', 's', 'mark']) state[tag] = Boolean(node?.closest?.(tag));
    setActive(state);
  }, [hostOf]);

  useEffect(() => {
    document.addEventListener('selectionchange', reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('selectionchange', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition]);

  /**
   * Wrap the selection, or unwrap it when it is already wrapped that way.
   *
   * Range surgery rather than execCommand: execCommand still works but
   * emits `<font>` tags and inline styles, which is precisely the markup
   * this design exists to avoid storing.
   */
  function wrap(build: () => HTMLElement, matches: (el: HTMLElement) => boolean) {
    const sel = window.getSelection();
    const host = hostOf(sel);
    if (!host || !sel) return;

    const range = sel.getRangeAt(0);
    const anchor = (sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentNode) as HTMLElement | null;

    // Already inside one of these? Take it off instead of nesting a second.
    let existing: HTMLElement | null = null;
    for (let el = anchor; el && el !== host; el = el.parentElement) {
      if (matches(el)) { existing = el; break; }
    }
    if (existing) {
      const parent = existing.parentNode!;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      host.normalize();
    } else {
      const wrapper = build();
      try {
        wrapper.appendChild(range.extractContents());
        range.insertNode(wrapper);
      } catch {
        // A selection spanning a boundary the DOM will not let us wrap.
        // Doing nothing beats leaving the field half-wrapped.
        return;
      }
    }

    sel.removeAllRanges();
    onChange(host);
    reposition();
  }

  const tag = (name: string) =>
    wrap(
      () => document.createElement(name),
      (el) => el.tagName.toLowerCase() === name
    );

  const attr = (key: string, value: string) =>
    wrap(
      () => {
        const s = document.createElement('span');
        s.setAttribute(key, value);
        return s;
      },
      (el) => el.tagName === 'SPAN' && el.getAttribute(key) === value
    );

  /** Strip every mark from the selection, leaving the words. */
  function clear() {
    const sel = window.getSelection();
    const host = hostOf(sel);
    if (!host || !sel) return;
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    const text = document.createTextNode(frag.textContent ?? '');
    range.insertNode(text);
    host.normalize();
    sel.removeAllRanges();
    onChange(host);
    setAt(null);
  }

  if (!at) return null;

  return (
    <div
      ref={barRef}
      dir="rtl"
      // mousedown, not click: the browser clears the selection on mousedown
      // elsewhere, and a toolbar that destroys what it acts on is a toolbar
      // whose every button does nothing.
      onMouseDown={(e) => e.preventDefault()}
      className={`fixed z-[70] -translate-x-1/2 rounded-xl bg-[#121926] p-1 shadow-xl ${
        // Above the words normally; below them when there is no room above,
        // because a toolbar off the top of the screen is a toolbar the
        // seller concludes is broken.
        at.below ? '' : '-translate-y-full'
      }`}
      style={{ top: at.below ? at.top + at.height + 10 : at.top - 10, left: at.left }}
    >
      <div className="flex items-center gap-0.5">
        <button title="عريض" onMouseDown={(e) => { e.preventDefault(); tag('b'); }} className={`${CHIP} ${active.b ? ON : OFF}`}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button title="مائل" onMouseDown={(e) => { e.preventDefault(); tag('i'); }} className={`${CHIP} ${active.i ? ON : OFF}`}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button title="تحته خط" onMouseDown={(e) => { e.preventDefault(); tag('u'); }} className={`${CHIP} ${active.u ? ON : OFF}`}>
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button title="مشطوب" onMouseDown={(e) => { e.preventDefault(); tag('s'); }} className={`${CHIP} ${active.s ? ON : OFF}`}>
          <Strikethrough className="h-3.5 w-3.5" />
        </button>
        <button title="تظليل" onMouseDown={(e) => { e.preventDefault(); tag('mark'); }} className={`${CHIP} ${active.mark ? ON : OFF}`}>
          <Highlighter className="h-3.5 w-3.5" />
        </button>

        <span className="mx-0.5 h-4 w-px bg-white/15" />

        <button title="اللون" onMouseDown={(e) => { e.preventDefault(); setOpen(open === 'color' ? null : 'color'); }} className={`${CHIP} ${OFF}`}>
          <span className="h-3.5 w-3.5 rounded-full border border-white/40 bg-gradient-to-br from-[#ef4444] via-[#f59e0b] to-[#0ea5e9]" />
        </button>
        <button title="الحجم" onMouseDown={(e) => { e.preventDefault(); setOpen(open === 'size' ? null : 'size'); }} className={`${CHIP} ${OFF}`}>
          <span className="leading-none">A<span className="text-[8px]">A</span></span>
        </button>
        <button title="الخط" onMouseDown={(e) => { e.preventDefault(); setOpen(open === 'font' ? null : 'font'); }} className={`${CHIP} ${OFF}`}>
          خط
        </button>

        <span className="mx-0.5 h-4 w-px bg-white/15" />

        <button title="إزالة التنسيق" onMouseDown={(e) => { e.preventDefault(); clear(); }} className={`${CHIP} ${OFF}`}>
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>

      {open === 'color' && (
        <div className="mt-1 flex flex-wrap gap-1 border-t border-white/10 pt-1.5">
          {MARK_COLORS.map((c) => (
            <button
              key={c.key}
              title={c.label}
              onMouseDown={(e) => { e.preventDefault(); attr('data-c', c.key); }}
              className="h-5 w-5 rounded-full border border-white/30"
              style={{ background: c.css }}
            />
          ))}
        </div>
      )}

      {open === 'size' && (
        <div className="mt-1 flex gap-1 border-t border-white/10 pt-1.5">
          {MARK_SIZES.map((s) => (
            <button
              key={s.key}
              onMouseDown={(e) => { e.preventDefault(); attr('data-s', s.key); }}
              className={`${CHIP} ${OFF} px-2`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {open === 'font' && (
        <div className="mt-1 max-h-44 w-48 overflow-y-auto border-t border-white/10 pt-1.5">
          {fonts.map((f) => (
            <button
              key={f.key}
              onMouseDown={(e) => { e.preventDefault(); attr('data-f', f.key); }}
              className="block w-full rounded px-2 py-1 text-start text-[13px] text-[#e3e8ef] hover:bg-white/10"
              style={{ fontFamily: f.stack }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
