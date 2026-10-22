'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { apiJson } from '@/lib/api-client';
import { RiArrowLeftLine, RiInformationLine, RiMenuLine, RiSearchLine, RiStore2Line } from '@remixicon/react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE FIRST-RUN TOUR — FOUR STEPS, ONCE, AND NEVER AGAIN UNLESS ASKED.
 *
 * المرحلة ٢ — «الدليل جوا النظام». The owner, 21/10: «حاسو معجوق وصعب».
 * The ⓘ (ScreenGuide.tsx) answers a person who is ALREADY lost on a screen;
 * this walks a person through the frame on their first morning, before they
 * are lost anywhere. It is not a second tooltip system and it shares no
 * code with one: it is one overlay, mounted in the shell, that runs once.
 *
 * ── ONCE IS A FACT ON THE USER ROW, NOT IN THE BROWSER ──
 *
 * `tourDoneAt` lives on the user (migration 20261022000000), arrives in the
 * session, and is written by PATCH /api/profile/tour. Somebody who works
 * from the counter and from a laptop is walked through once, not twice; a
 * browser they have never used does not walk them through it a third time.
 * The negative rule is absolute: once `tourDoneAt` is set, this component
 * never renders again, whatever the pathname, whatever the device.
 *
 * ── SKIPPING AND «ما بدي أشرح مرة ثانية» ──
 *
 * «تخطّي» closes for THIS sign-in only — a person who skipped on a busy
 * morning still gets it tomorrow morning, which is the point of skipping
 * rather than refusing. The checkbox beside it is the refusal: checked, the
 * dismissal is written to the row and it never opens again. Finishing the
 * last step writes the same thing — nobody completes a walkthrough and then
 * wants it replayed tomorrow.
 *
 * ── ANCHORED TO REAL ELEMENTS, BY A NAME, NOT A PIXEL ──
 *
 * Each step names an element by `data-tour="…"`, and the card is placed
 * beside whatever is actually there at run time — the menu, the store chip,
 * the search box, the ⓘ in the title. If an element is not on the screen
 * (a phone folds the sidebar; a screen without a guide has no ⓘ) the step
 * is skipped rather than drawn against nothing: a tour that points at
 * empty air teaches nobody anything except distrust.
 *
 * ── ARABIC, RTL, SHORT ──
 *
 * One sentence per step. Latin digits (`ar-u-nu-latn`), like every number
 * this interface prints. The tour interrupts, so it says the least it can.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** A step: the element it stands beside, and the one sentence it says. */
interface TourStep {
  /** The `data-tour` name of the real element this step is anchored to. */
  anchor: string;
  /** One short Arabic sentence. */
  text: string;
  /** The glyph that names the thing, so the card is findable at a glance. */
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: TourStep[] = [
  {
    anchor: 'sidebar',
    icon: RiMenuLine,
    text: 'هذه القائمة: كل شاشات النظام مرتّبة فيها بمجموعات، واضغط المجموعة لتفتح شاشاتها.',
  },
  {
    anchor: 'context',
    icon: RiStore2Line,
    text: 'هنا المتجر والبلد اللي أنت شغّال عليهما الآن — كل الأرقام في كل شاشة تخصّ هذا المتجر، واضغط البطاقة للتبديل.',
  },
  {
    anchor: 'search',
    icon: RiSearchLine,
    text: 'هذا الصندوق يلاقي كل شي: طلباً أو عميلاً أو شاشة أو زراً. اختصاره Ctrl+K.',
  },
  {
    anchor: 'guide',
    icon: RiInformationLine,
    text: 'بجانب عنوان كل شاشة زر «ⓘ» يشرح الشاشة خطوة خطوة — إذا ضاع عليك شي اضغطه.',
  },
];

/** Where the card goes relative to its anchor, per side of the screen. */
function place(rect: DOMRect): { top: number; left: number } {
  // The sidebar stands on the RIGHT (RTL), the header on top. The card is
  // drawn beside the anchor with a 12px gap, clamped into the viewport.
  const W = 320;
  const H = 150; // measured max; clamping below keeps it honest
  let left = rect.left - W - 12;
  if (left < 8) left = Math.min(rect.right + 12, window.innerWidth - W - 8);
  let top = rect.top;
  if (top + H > window.innerHeight - 8) top = Math.max(8, window.innerHeight - H - 8);
  return { top: Math.max(8, top), left };
}

export function FirstRunTour() {
  const { currentUser, refreshUser } = useApp();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [neverAgain, setNeverAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The anchor of the CURRENT step, re-read whenever the step moves. */
  const asked = useRef('');

  // Opens at most once per mount, only for a user who has never dismissed it.
  useEffect(() => {
    if (currentUser && !currentUser.tourDoneAt && !open) {
      setStep(0);
      setOpen(true);
    }
    // `open` is deliberately not a trigger: the effect must not re-open what
    // the person just dismissed. It is read to keep the guard honest only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.tourDoneAt]);

  const current = STEPS[step];

  // Find the anchor of the current step — and skip past any step whose
  // element is not on this screen at all. A tour that cannot point at the
  // thing says nothing by standing there, so it moves on.
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(`[data-tour="${current.anchor}"]`);
    if (!el) {
      setStep((s) => (s + 1 < STEPS.length ? s + 1 : s));
      if (step + 1 >= STEPS.length) setOpen(false);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect(r);
    const onMove = () => setRect(el.getBoundingClientRect());
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, step, current.anchor]);

  /** Writes the dismissal to the row, and never throws at the person. */
  const dismissForever = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      await apiJson('/api/profile/tour', { method: 'PATCH' });
      await refreshUser();
    } catch {
      // The tour closed regardless; a failed write costs one more tour on
      // the next sign-in, never a stuck overlay or an error to a new user.
      refreshUser().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, [busy, refreshUser]);

  const next = () => {
    if (step + 1 < STEPS.length) {
      setStep(step + 1);
    } else {
      void dismissForever();
    }
  };

  const skip = () => {
    if (neverAgain) void dismissForever();
    else setOpen(false);
  };

  if (!open || !currentUser || currentUser.tourDoneAt) return null;

  return (
    <div dir="rtl" data-testid="first-run-tour">
      {/* A dim veil, under the card and above the page: the tour interrupts
          on purpose, and an interrupting card that competes with a bright
          page behind it is read as one more widget. Pointer-events stay on
          the veil so a stray click dismisses nothing — the buttons decide. */}
      <div className="fixed inset-0 z-[60] bg-[var(--sys-background)]/50" aria-hidden />

      {rect && (
        <div
          role="dialog"
          aria-label="الجولة الأولى"
          style={{ top: place(rect).top, left: place(rect).left }}
          className="fixed z-[61] w-[320px] rounded-xl border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 shadow-[var(--sys-shadow-raised)]"
        >
          <div className="flex items-start gap-3">
            <current.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sys-primary)]" aria-hidden />
            <p className="text-sm leading-relaxed text-[var(--sys-heading)]">{current.text}</p>
          </div>

          <p className="mt-3 text-xs text-[var(--sys-muted-foreground)] tabular-nums">
            خطوة {step + 1} من {STEPS.length}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={skip}
              className="h-10 px-3 rounded-lg border border-[var(--sys-border)] text-xs font-medium text-[var(--sys-muted-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
            >
              تخطّي
            </button>
            <button
              type="button"
              onClick={next}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
            >
              {step + 1 < STEPS.length ? 'التالي' : 'خلصت'}
              <RiArrowLeftLine className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {step === 0 && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--sys-muted-foreground)]">
              <input
                type="checkbox"
                checked={neverAgain}
                onChange={(e) => setNeverAgain(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--sys-border)]"
              />
              ما بدي أشرح مرة ثانية
            </label>
          )}
        </div>
      )}
    </div>
  );
}
