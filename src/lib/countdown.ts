/**
 * THE CLOCK AND THE PRICE READ ONE FACT.
 *
 * Owner decision D8, the second half: urgency has the same two sources as
 * social proof — يدوي and تلقائي — and the same rule binds both. A number
 * that is not real carries «مثال»; a counter that is real is read from the
 * thing it counts down to.
 *
 * ── WHAT WAS THERE BEFORE ──
 *
 * The `urgency` block carries `minutes`: a per-VISITOR timer. It starts
 * when the page loads, it restarts for the next visitor, and when it
 * reaches zero NOTHING HAPPENS — the offer carries on at the same price.
 * It is not a lie the seller told; it is a widget whose honest reading
 * nobody wrote down. The first customer who refreshes the page learns that
 * the number is decoration, and after that no number on the page is
 * believed.
 *
 * It stays, because a «ثلاث ساعات لعرض اليوم» strip on a page that really
 * does change daily is a reasonable thing to want. What changes is that
 * the editor now says out loud what it does, with the fix beside the
 * warning.
 *
 * ── AND «AUTOMATIC» MEANS THE OFFER'S OWN ENDING ──
 *
 * `Offer.endsAt` is the one fact (src/lib/offers.ts says so in its own
 * words: «the clock the customer sees and the moment the price stops
 * applying read this same column»). So a countdown set to `offer` is bound
 * to it, and `countdownRefusal` REFUSES THE CONFIGURATION when there is no
 * such ending to read. Not a warning, not a fallback to the per-visitor
 * timer — a refusal at the save door, because a fallback is how a page
 * ends up with the dishonest clock the seller thought they had replaced.
 *
 * Nothing here reaches a shop's stylesheet or the dashboard's: it is text
 * and one comparison.
 */

/** Where a countdown gets its ending. */
export const COUNTDOWN_SOURCES = ['visitor', 'offer'] as const;
export type CountdownSource = (typeof COUNTDOWN_SOURCES)[number];

export const COUNTDOWN_SOURCE_LABEL: Record<CountdownSource, string> = {
  visitor: 'يدوي — مدّة تبدأ مع كل زائر',
  offer: 'تلقائي — تاريخ انتهاء العرض',
};

/**
 * THE TWO SENTENCES THE EDITOR SHOWS BESIDE THE PER-VISITOR TIMER.
 *
 * Exported as data and not typed into the component, because the test that
 * holds them to the brief's wording has to read the same strings the screen
 * does. The brief wrote the words; they are not paraphrased here.
 *
 * AND THE BRIEF'S ⚠ AND 🔧 ARE NOT IN THEM. The brief drew the
 * warning and the fix with emoji, which is the right instruction and the
 * wrong character: `one-icon-family.test.ts` refuses an emoji anywhere a
 * dashboard screen can read, because an emoji is a colour glyph on a phone
 * and a thin monochrome outline on a desk — the same mark rendered two
 * ways. So the marks are the icon set's (`RiAlertLine`, `RiToolsLine`),
 * drawn beside these strings by the editor, and the strings are the words.
 */
export const VISITOR_TIMER_WARNING = 'العدّاد بيرجع لكل زائر والعرض ما بينتهي';
export const VISITOR_TIMER_FIX = 'اربطه بتاريخ انتهاء حقيقي';

/** What a `source: 'offer'` countdown needs to exist: a real future ending. */
export interface CountdownFact {
  /** The product's offers' end dates, nulls included. */
  endsAt: (Date | null | undefined)[];
  /** «Now», passed in so the rule stays pure and a test can choose it. */
  now: Date;
}

/**
 * The ending a `source: 'offer'` countdown reads — the SOONEST one still
 * ahead of us — or null when there is none.
 *
 * The soonest and not the latest: the customer is being told when the thing
 * in front of them stops, and the first bundle to expire is the first
 * promise the page breaks if it says otherwise.
 */
export function countdownEnd(fact: CountdownFact): Date | null {
  const future = fact.endsAt
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .filter((d) => d.getTime() > fact.now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return future[0] ?? null;
}

/**
 * Why this countdown cannot be configured, in the seller's language — or
 * null when it can.
 *
 * A REFUSAL AND NOT A WARNING, for `source: 'offer'` with nothing to read.
 * The whole of this item is that the clock and the price are one fact; a
 * clock set to «automatic» with no automatic ending is the dishonest widget
 * wearing the honest word, which is worse than the widget was.
 *
 * `source: 'visitor'` is never refused. It is what the seller already has,
 * it is legal, and the editor tells the truth about it instead.
 */
export function countdownRefusal(source: CountdownSource, fact: CountdownFact): string | null {
  if (source !== 'offer') return null;
  if (countdownEnd(fact)) return null;
  return 'العدّاد التلقائي يقرأ تاريخ انتهاء العرض، وما في عرض له تاريخ انتهاء بعد. حدّد تاريخ انتهاء للعرض أولاً، أو اختر المدّة اليدوية.';
}

/**
 * Is this number real, or an example?
 *
 * The product's honesty rule in one predicate: a figure the system measured
 * is shown as itself, and anything else wears «مثال». Used by the editor's
 * preview, where the offers are not loaded and the clock has to show
 * SOMETHING for the seller to position — so it shows a sample and says so.
 */
export const EXAMPLE_BADGE = 'مثال';
