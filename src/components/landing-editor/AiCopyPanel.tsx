'use client';

import { useMemo, useState } from 'react';
import { RiAlertLine, RiMagicLine } from '@remixicon/react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { screenApi } from '@/lib/screen-api';
import { applyCopyToSections, sameArrangement } from '@/lib/landing-copy-apply';
import type { LandingSection } from '@/lib/landing-sections';
import { DIALECTS, DIALECT_LABEL, type Dialect } from '@/lib/landing-structure';
import { LANDING_STRUCTURES } from '@/lib/landing-structures';

/**
 * THE PROPOSAL, REACHABLE FROM INSIDE THE EDITOR.
 *
 * It was reachable from the CREATE dialog and nowhere else — so the one
 * moment a seller could ask for words was the moment before they had seen
 * the page. Afterwards, editing a page that already existed, the button was
 * gone: to ask again they had to create a second page, copy the words out
 * of it by hand and delete it. Which is what people did.
 *
 * ── WHAT IT DOES NOT DO, AND THIS IS THE POINT ──
 *
 * It does not rebuild the page. The create dialog uses
 * `structureToSections`, which makes one block per entry in the structure's
 * sequence — right for a page that does not exist yet and destructive for
 * one a seller has arranged, because it would throw away the blocks they
 * added, the ones they deleted, the order they dragged them into and every
 * look they set.
 *
 * The owner's rule for this work: «a look never changes the ARRANGEMENT of
 * anything a person arranged», and words are not even a look. So the copy
 * is fitted into the page as it stands — `landing-copy-apply.ts` — and the
 * result is checked against the arrangement it started from before it is
 * handed over. A proposal that moved a block is refused, not shown.
 *
 * ── AND IT WRITES NOTHING ──
 *
 * The answer lands in the editor's own sections, in memory, and is saved by
 * the «حفظ» the seller would press anyway — into `contentDraft`, invisible
 * until they publish. `ai-proposal-only.test.ts` holds «كلّ إجراء ذكاءٍ
 * اصطناعيٍّ اقتراحٌ فقط» as an invariant with a sweep behind it.
 *
 * ── WHAT THE MODEL IS GIVEN ──
 *
 * Nothing from here. The browser names a structure by id, a product by id
 * and a dialect; the route reads the product and builds the brief. No
 * customer, no order, no phone, no address — the assistant is declared
 * `pii: false`, and a structure's slots are the instructions the model
 * follows, so a caller who could post them would be running a prompt
 * somebody else wrote under this shop's key.
 *
 * ── THE 2c PROPOSAL, WHEN IT LANDS ──
 *
 * The storefront task 2c grows this same assistant by `structure ·
 * structureWhy · family · familyWhy` beside `copy`. That work is on its own
 * branch and not merged, so what this panel offers today is the copy half:
 * the seller picks the structure, the model writes the words. When 2c
 * merges, the structure select below takes the model's own suggestion and
 * its reason as its default — one panel, one place, no second door.
 */

interface Proposal {
  structureId: string;
  dialect: Dialect;
  /** slot key → the one dialect that was asked for. */
  copy: Record<string, string>;
  note?: string | null;
}

export function AiCopyPanel({
  productId,
  sections,
  onSections,
}: {
  /** The product this page sells. Without one there is no brief to write. */
  productId: string;
  sections: LandingSection[];
  onSections: (next: LandingSection[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [structureId, setStructureId] = useState(LANDING_STRUCTURES[0]?.id ?? '');
  const [dialect, setDialect] = useState<Dialect>('levantine');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const structure = LANDING_STRUCTURES.find((s) => s.id === structureId) ?? null;

  /**
   * The proposal fitted to THIS page, computed before anything is applied.
   *
   * Two things come out of it and both are shown: what would be written,
   * and what the page has no block for. A seller seeing «الجدول: ما في قسم
   * مقارنة بالصفحة» can add the block and press again — which is a sentence
   * they can act on, unlike a line that silently did not appear.
   */
  const fitted = useMemo(() => {
    if (!structure || !proposal) return null;
    const copy = Object.fromEntries(
      Object.entries(proposal.copy).map(([slot, text]) => [slot, { [proposal.dialect]: text }])
    );
    return applyCopyToSections({
      sections,
      structure,
      copy,
      dialect: proposal.dialect,
      only: [...picked],
    });
  }, [structure, proposal, sections, picked]);

  /** Every slot the model answered, whether this page can hold it or not. */
  const answered = useMemo(() => {
    if (!structure || !proposal) return [];
    return structure.slots
      .filter((s) => (proposal.copy[s.key] ?? '').trim() !== '')
      .map((s) => ({ key: s.key, label: s.label, text: proposal.copy[s.key] }));
  }, [structure, proposal]);

  /** Slots the model answered that this page has no home for, by key. */
  const homeless = useMemo(() => {
    if (!structure || !proposal) return new Set<string>();
    const all = applyCopyToSections({
      sections,
      structure,
      copy: Object.fromEntries(
        Object.entries(proposal.copy).map(([slot, text]) => [slot, { [proposal.dialect]: text }])
      ),
      dialect: proposal.dialect,
    });
    return new Set(all.unplaced.map((u) => u.slotKey));
  }, [structure, proposal, sections]);

  const ask = async () => {
    setError(null);
    setApplied(null);
    setProposal(null);
    try {
      /*
       * THROUGH `screenApi`, WHICH IS WHAT THE CREATE DIALOG USES FOR THIS
       * SAME CALL — and not through `apiJson`.
       *
       * `apiJson` puts a 15-second `AbortSignal.timeout` on every request,
       * which is right for every screen in this product and wrong for this
       * one endpoint: the route asks the model for nine to twelve Arabic
       * paragraphs and allows it 60 seconds, so the browser would abort a
       * call that was going to succeed and the seller would read «انتهت
       * مهلة الطلب» about words that arrived. Two doors to one assistant
       * must not have two different ideas of how long it may take.
       */
      const data = (await screenApi('/api/ai/landing-copy', {
        method: 'POST',
        body: JSON.stringify({ structureId, productId, dialect }),
      })) as Proposal;
      setProposal(data);
      // Pre-ticked, because a seller who asked for words wants the words.
      // Every line is still a tick they can clear before anything moves.
      setPicked(new Set(Object.keys(data.copy ?? {})));
    } catch (e) {
      // The server's own sentence: «لم يُفهم جواب الذكاء الاصطناعي» is
      // actionable and «حدث خطأ» is not. Re-thrown so the button that ran
      // it answers a failure with a shake rather than with a tick.
      setError(e instanceof Error ? e.message : 'تعذّر التوليد');
      throw e;
    }
  };

  const apply = () => {
    if (!fitted || fitted.empty) return;
    /*
     * THE LAST CHECK, HERE RATHER THAN IN A TEST ONLY.
     *
     * By the time a seller notices their blocks have moved, the undo stack
     * is the only thing between them and an evening's work — and they may
     * have saved by then. So the result is compared with what it started
     * from, and a proposal that changed the arrangement is refused with the
     * reason on the screen instead of applied with an apology.
     */
    if (!sameArrangement(sections, fitted.sections)) {
      setError('رُفض الاقتراح: كان سيغيّر ترتيب الأقسام. ما تغيّر شي.');
      return;
    }
    onSections(fitted.sections);
    setApplied(
      `كُتبت ${fitted.placed.length} خانة في أقسامك — الترتيب ما تغيّر. اضغط «تراجع» للرجوع، أو «حفظ» لتثبيتها كمسوّدة.`
    );
  };

  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 md:min-h-0 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--sys-border-strong)] px-2 py-1.5 text-xs font-semibold text-[var(--sys-muted-foreground)] transition hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
      >
        <RiMagicLine className="h-4 w-4" />
        {open ? 'إغلاق مساعد النصوص' : 'اكتب النصوص بالذكاء الاصطناعي'}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            الذكاء الاصطناعي يقترح نصوصاً للأقسام الموجودة في صفحتك. لا يضيف قسماً ولا يحذف واحداً
            ولا يغيّر الترتيب، ولا يُحفظ شي قبل ما تضغط «حفظ».
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--sys-heading)]">
                بنية الإقناع
              </span>
              <Select value={structureId} onChange={(e) => setStructureId(e.target.value)}>
                {LANDING_STRUCTURES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {structure && (
                <span className="mt-1 block text-xs leading-relaxed text-[var(--sys-muted)]">
                  {structure.forWhom}
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--sys-heading)]">اللهجة</span>
              <Select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
                {DIALECTS.map((d) => (
                  <option key={d} value={d}>
                    {DIALECT_LABEL[d]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <Button variant="secondary" size="sm" className="w-full" onClick={ask}>
            <RiMagicLine className="h-4 w-4" /> اقترح النصوص
          </Button>

          {/*
            COLOURED TEXT ON THE ORDINARY SURFACE, not a tinted box.

            It is how this screen already says the same two things (the
            message beside «حفظ» in the header), and the CSS ratchet in
            `quality-gates` counts every new utility a file invents — so a
            second vocabulary for one meaning costs bytes on every page in
            the product, not only this panel.
          */}
          {error && (
            <p className="rounded-lg bg-[var(--sys-surface)] p-2 text-xs leading-relaxed text-[var(--sys-destructive)]">
              {error}
            </p>
          )}
          {applied && (
            <p className="rounded-lg bg-[var(--sys-surface)] p-2 text-xs leading-relaxed text-[var(--sys-success)]">
              {applied}
            </p>
          )}

          {proposal && (
            <div className="space-y-2">
              {proposal.note && (
                <p className="rounded-lg bg-[var(--sys-surface)] p-2 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
                  {proposal.note}
                </p>
              )}

              {answered.length === 0 ? (
                <p className="text-xs text-[var(--sys-muted)]">لم يرجع أيّ نص — جرّب مرّة ثانية.</p>
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto pe-1">
                  {answered.map((row) => {
                    const lost = homeless.has(row.key);
                    return (
                      <li
                        key={row.key}
                        className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5"
                      >
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-[var(--sys-primary)]"
                            disabled={lost}
                            checked={picked.has(row.key) && !lost}
                            onChange={(e) =>
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(row.key);
                                else next.delete(row.key);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-[var(--sys-heading)]">
                              {row.label}
                            </span>
                            <span className="block text-xs leading-relaxed text-[var(--sys-foreground)]">
                              {row.text}
                            </span>
                            {lost && (
                              <span className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-[var(--sys-warning)]">
                                <RiAlertLine className="mt-0.5 h-4 w-4 shrink-0" />
                                ما في قسم بصفحتك يستقبل هذا النص. أضف القسم ثم اطلب مرّة ثانية.
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Button
                size="sm"
                className="w-full"
                disabled={!fitted || fitted.empty}
                onClick={apply}
              >
                طبّق على أقسامي ({fitted?.placed.length ?? 0})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
