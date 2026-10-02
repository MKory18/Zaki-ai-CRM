'use client';

import { DIALECTS, copyIn, type Dialect, type LandingStructure } from '@/lib/landing-structure';

/**
 * THE WRITING GUIDE, WHERE THE WRITING HAPPENS.
 *
 * «خانات النص بعدّاد أحرف، ومثال جنب كل خانة.»
 *
 * Every structure already carries, for each slot, what it is FOR, what must
 * NOT be said, and an example — and all three were invisible: they lived in
 * a data file a seller never opens. A guide kept anywhere other than beside
 * the field is a guide nobody reads, and the three sentences are most of
 * what makes one of these pages honest.
 *
 * THE COUNTER COUNTS CHARACTERS, as the limit does. Arabic words run long
 * and a word count would let a headline overflow a 360px phone, which is
 * the screen every one of these pages is read on. It counts with the
 * spread operator, not `.length`: a string's `length` counts UTF-16 units,
 * so an emoji or a rare glyph would be counted twice and the seller would
 * be stopped early for no reason they could see.
 *
 * AND IT DOES NOT CUT. A field that truncates as somebody types takes the
 * end of their sentence away mid-word. It says how far over they are and
 * lets them finish; the save is where the limit is enforced.
 *
 * A FIELD HOLDS ITS OWN DIALECT AND NOBODY ELSE'S.
 *
 * It used to show the fallback — another dialect's sentence — as the
 * textarea's VALUE, with a note saying «اكتب فوقه». You could not: clearing
 * it put the other dialect's words straight back (the field was empty, so
 * `copyIn` fell back again), and typing after that appended to a sentence
 * the seller had not written. One test wrote Levantine over a formal line
 * and got «بالفصحىبالشامي».
 *
 * So the value is what was written FOR THIS DIALECT, and the other
 * dialect's line is the PLACEHOLDER: visible, not editable, and what the
 * visitor sees until this field is filled. Which is exactly what the
 * fallback is.
 */

export interface SlotCopy {
  [slotKey: string]: Record<string, string> | undefined;
}

export function SlotFields({
  structure,
  copy,
  dialect,
  onChange,
  /** The ad's hook, when the page is tied to one. */
  adHook,
}: {
  structure: LandingStructure;
  copy: SlotCopy;
  dialect: Dialect;
  onChange: (slotKey: string, dialect: Dialect, text: string) => void;
  adHook?: string | null;
}) {
  return (
    <div className="space-y-4">
      {structure.slots.map((slot) => {
        // THIS dialect's words — the only thing this field may edit.
        const written = copy[slot.key]?.[dialect] ?? '';
        // What a visitor would read today: this dialect, or whichever has text.
        const serving = copyIn(copy[slot.key], dialect);
        const used = [...written].length;
        const over = used > slot.max;
        const fallback = !written && serving.length > 0;

        return (
          <div key={slot.key} className="rounded-lg border border-[var(--sys-border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={`slot-${slot.key}`} className="text-xs font-bold text-[var(--sys-heading)]">
                {slot.label}
                {!slot.required && <span className="text-[var(--sys-muted)]"> — اختياري</span>}
              </label>
              <span
                className={`text-xs tabular-nums ${over ? 'font-bold text-[var(--sys-destructive)]' : 'text-[var(--sys-muted)]'}`}
                dir="ltr"
              >
                {used} / {slot.max}
              </span>
            </div>

            <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{slot.purpose}</p>

            <textarea
              id={`slot-${slot.key}`}
              value={written}
              placeholder={fallback ? serving : undefined}
              onChange={(e) => onChange(slot.key, dialect, e.target.value)}
              rows={slot.max > 160 ? 4 : 2}
              className="mt-2 w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-2 text-sm text-[var(--sys-foreground)]"
            />

            {over && (
              <p className="mt-1 text-xs font-semibold text-[var(--sys-destructive)]">
                أطول من حدّ الخانة بـ{used - slot.max} حرفاً — الزائد سيُقصّ عند الحفظ.
              </p>
            )}

            {fallback && (
              // Said, because a seller who did not notice would believe
              // they had written this line. It is in the placeholder rather
              // than in the field: the words are another dialect's and this
              // field cannot edit them.
              <p className="mt-1 text-xs text-[var(--sys-muted)]">
                الخانة فارغة بهذه اللهجة — يظهر للزائر نصُّ لهجةٍ أخرى حتى تكتب هنا.
              </p>
            )}

            {/*
              WHAT NOT TO SAY, BESIDE WHAT TO SAY. Every slot has one way of
              going wrong that is likelier than the others, and naming it is
              the whole value of a guide.
            */}
            <p className="mt-2 text-xs leading-relaxed text-[var(--sys-destructive)]">
              ممنوع: {slot.avoid}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--sys-muted)]">
              مثال: «{slot.example}»
            </p>

            {/*
              «اقتراح مساعد: إذا الإعلان المرتبط معروف، عنوان البطل بيتعبّى
              مبدئياً من خطّافه — للمراجعة لا للنشر المباشر».

              It fills the FIELD and nothing else — no auto-save, no publish
              — so the seller reads it, changes it, and owns it. A
              suggestion that wrote itself into a live page would be this
              system putting words in somebody's shop.
            */}
            {slot.key === 'heroTitle' && adHook && adHook.trim() && !written && (
              <button
                type="button"
                onClick={() => onChange(slot.key, dialect, adHook.trim().slice(0, slot.max))}
                className="mt-2 text-xs font-bold text-[var(--sys-primary)] underline"
              >
                اقترِح من خطّاف الإعلان: «{adHook.trim().slice(0, 40)}»
              </button>
            )}
          </div>
        );
      })}

      <p className="text-xs leading-relaxed text-[var(--sys-muted)]">
        اللهجات المتاحة: {DIALECTS.length} — ما لا تكتبه بلهجة يظهر بالفصحى المبسّطة.
      </p>
    </div>
  );
}
