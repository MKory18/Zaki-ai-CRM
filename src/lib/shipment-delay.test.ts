import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { HOLD_ADVICE_DAYS } from '@/components/ops/DelayShipmentDialog';
import { MAX_HOLD_DAYS } from '@/app/api/ops/shipments/hold/route';

/**
 * «أجّل» ASKED FOR NO DATE, AND NOTHING EVER BROUGHT THE ORDER BACK.
 *
 * Two faults, and I caused the second one myself.
 *
 *   THE HOLD HAD NO END. `until` was optional and a missing one stored the
 *   year 2999. `shipHoldUntil` is read by two files, the shipment list
 *   simply excludes anything held, and nothing anywhere announces a held
 *   order or returns it. A parcel held «for now» by somebody who then went
 *   on leave was gone — with its goods still reserved against it.
 *
 *   AND THE ROW HAD TWO BUTTONS FOR ONE THOUGHT. «أجّل» and «للمتابعة»,
 *   added in the previous batch, both read as postponing. Nobody at a
 *   packing table can decode «the first keeps the goods reserved and the
 *   confirmation standing, the second undoes both» from two labels before
 *   pressing one.
 *
 * The distinction is real and it is kept. It moved out of the button names
 * and into a sentence at the moment of choosing — which is also the only
 * place a person has the facts to choose with.
 */

const route = () => stripComments(repoFile('src/app/api/ops/shipments/hold/route.ts'));
const dialog = () => stripComments(repoFile('src/components/ops/DelayShipmentDialog.tsx'));
const screen = () => stripComments(repoFile('src/components/screens/ShipmentsNewScreen.tsx'));

describe('a hold now ends on a day', () => {
  it('the date is required, not optional', () => {
    const src = route();
    expect(src, 'الموعد ما زال اختيارياً').not.toMatch(
      /until: z\.string\(\)\.datetime\(\)\.optional\(\)/
    );
    expect(src).toMatch(/until: z\.string\(\)\.datetime\(\{ offset: true \}\)\.or\(/);
  });

  /** Storing the year 2999 is not an open-ended hold, it is a lost order. */
  it('and there is no «forever» left to fall back to', () => {
    const src = route();
    expect(src, 'ما زال يخزّن سنة ٢٩٩٩').not.toContain('2999-12-31');
    expect(src, 'ما زال يسقط إلى FOREVER').not.toMatch(/until \? new Date\(until\) : FOREVER/);
    expect(src).toContain('shipHoldUntil: new Date(until as string)');
  });

  /**
   * A release carries no date, so the two requests have two shapes. One
   * shape with everything optional accepts neither properly.
   */
  it('except the release, which is its own shape', () => {
    const src = route();
    expect(src).toMatch(/z\.union\(\[/);
    expect(src).toMatch(/release: z\.literal\(true\)/);
  });

  /** Reserved goods are goods nobody else can be sold. */
  it('and a hold cannot run for months', () => {
    const src = route();
    expect(MAX_HOLD_DAYS).toBe(30);
    expect(src, 'حارس المدّة القصوى معطَّل').toMatch(/if \(due\.getTime\(\) > maxAt\) \{/);
    expect(src).toContain('HOLD_TOO_LONG');
    // And it names the other instrument rather than just refusing.
    expect(src).toContain('أعِده إلى المتابعة');
  });

  it('nor start in the past', () => {
    expect(route()).toMatch(/due\.getTime\(\) < Date\.now\(\) - 60_000/);
  });

  /** The order comes back by itself: the list already filters on this column. */
  it('and the message says the order returns on the day, by itself', () => {
    expect(route()).toContain('ويعود إلى قائمة الشحن يومَها وحده');
    expect(stripComments(repoFile('src/app/api/ops/shipments/route.ts'))).toContain(
      'shipHoldUntil: { lte: new Date() }'
    );
  });
});

describe('and the row asks once, instead of offering two words for it', () => {
  it('has one delay control, not two', () => {
    const src = screen();
    expect(src, 'ما زال زرّ «للمتابعة» الثاني موجوداً').not.toContain('للمتابعة');
    expect(src).toContain('setDelaying(r)');
    // The cancel stays — it is a different act, and it always was.
    expect(src).toContain('setCancelling(r)');
  });

  it('and the two old handlers are gone, not merely unreachable', () => {
    const src = screen();
    expect(src, 'toggleHold ما زال في الملفّ').not.toContain('toggleHold');
    expect(src, 'postponeOrder ما زال في الملفّ').not.toContain('postponeOrder');
  });

  it('the dialog is mounted and wired to the row being delayed', () => {
    const src = screen();
    expect(src).toContain('<DelayShipmentDialog');
    expect(src, 'الحوار مرسومٌ ولا يُفتح').toMatch(/\{delaying && \(/);
  });

  /** Lifting a hold is the one half that carries no date. */
  it('and the held view still releases, without asking for one', () => {
    const src = screen();
    expect(src).toMatch(/view === 'held' \?/);
    // THE WIRING, not the name: the handler's own definition keeps the word
    // in the file however the button is gutted, and a first version of this
    // assertion passed with the onClick emptied out.
    expect(src, 'زرّ الإرجاع مفصولٌ عن معالجه').toMatch(
      /onClick=\{\(\) => void releaseHold\(r\)\}/
    );
    expect(src).toMatch(/orderId: row\.id, release: true/);
  });
});

describe('the dialog puts the choice in words, with the date first', () => {
  it('asks the date before either outcome, because both need one', () => {
    const src = dialog();
    expect(src).toContain('إلى متى؟');
    expect(src).toMatch(/type="date"/);
    // NEITHER button can be pressed without a valid one — asserted on the
    // condition rather than on one exact spelling, because the second button
    // carries a further condition of its own.
    const guards = src.match(/disabled=\{!valid \|\| busy[^}]*\}/g) ?? [];
    expect(guards.length, 'زرٌّ لا يشترط موعداً').toBe(2);
  });

  it('names what each outcome does to the goods', () => {
    const src = dialog();
    expect(src).toContain('وبضاعتُه محجوزةً له');
    expect(src).toContain('وتعود بضاعتُه للبيع فوراً');
    expect(src).toContain('الطلبات المؤجلة');
  });

  it('and one goes to the hold door while the other stands the order down', () => {
    const src = screen();
    expect(src).toMatch(/if \(choice\.kind === 'HOLD'\) \{/);
    expect(src).toContain("'/api/ops/shipments/hold'");
    expect(src).toContain("'/api/ops/shipments/stand-down'");
    expect(src).toContain("outcome: 'POSTPONE'");
  });

  /**
   * The consequence of the date, before the choice — otherwise the reader
   * has to know that three weeks of reserved stock is expensive.
   */
  it('warns when the wait is long enough that reserving is the wrong answer', () => {
    const src = dialog();
    expect(HOLD_ADVICE_DAYS).toBe(7);
    expect(HOLD_ADVICE_DAYS).toBeLessThan(MAX_HOLD_DAYS);
    expect(src, 'التحذير معطَّل').toMatch(/const longWait = valid && days > HOLD_ADVICE_DAYS;/);
    expect(src).toMatch(/\{longWait && \(/);
  });

  /** The boundary must not shift under somebody mid-type. */
  it('and reads the clock once, when it opens', () => {
    const src = dialog();
    expect(src).toContain('const [openedAt] = useState(() => Date.now());');
    expect(src, 'يقرأ الساعة أثناء الرسم').not.toMatch(/> Date\.now\(\) - 60_000/);
  });
});

/**
 * AND IT DOES NOT OFFER WHAT THE DOOR WILL REFUSE.
 *
 * Measured on this database: two of the five rows the shipment list offered
 * already carried a printed waybill. `assertCancellable` refuses those, so
 * «أعِده إلى المتابعة» failed every time it was pressed on them — and a
 * control that always fails teaches people the screen is lying, which is
 * worse than a screen that offers one choice instead of two.
 *
 * The hold half stays: a printed label does not stop us keeping the parcel
 * back, only from un-confirming the sale behind it.
 */
describe('the half that cannot work is not offered', () => {
  const list = () => stripComments(repoFile('src/app/api/ops/shipments/route.ts'));

  it('the list runs the same guard the door does, not a copy of its rule', () => {
    const src = list();
    expect(src).toContain('assertCancellable(order as unknown as StateSource)');
    expect(src).toContain('standDownBlocked');
    // The fields that guard reads have to be selected, or it always allows.
    expect(src, 'الحارس يقرأ حقولاً غير مُحمَّلة').toContain('labelPrintedAt: true');
  });

  it('and the dialog disables that outcome, with the reason in its place', () => {
    const src = dialog();
    expect(src, 'الخيار المرفوض ما زال قابلاً للضغط').toMatch(
      /disabled=\{!valid \|\| busy \|\| !!standDownBlocked\}/
    );
    expect(src).toMatch(/standDownBlocked\s*\?\s*standDownBlocked\.message/);
  });

  /** Keeping the parcel back is still possible with a printed label. */
  it('while the hold stays available', () => {
    const src = dialog();
    const holdBtn = src.slice(src.indexOf("choose('HOLD')") - 200, src.indexOf("choose('HOLD')"));
    expect(holdBtn, 'الحجز عُطِّل أيضاً').not.toContain('standDownBlocked');
  });

  it('and the screen passes the verdict down rather than guessing', () => {
    const src = screen();
    expect(src).toContain('standDownBlocked={delaying.standDownBlocked}');
  });
});
