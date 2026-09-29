import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { ALL_ROUTES } from './route-registry';

/**
 * «أجّلتُه ولم يذهب إلى الطلبات المؤجّلة».
 *
 * The postpone worked. The dialog asks «إلى متى؟» and refuses to proceed
 * without a date, the hold is written, and the order leaves the ready
 * list. What was wrong was WHERE IT WENT — and what that place is called.
 *
 * This product had two things named «مؤجَّلة»: a screen in the menu,
 * «الطلبات المؤجلة», which is a CUSTOMER who asked to be rung back on
 * Thursday; and a tab inside the shipment screen, which is a PARCEL held
 * off a van. Different people work them and neither list wants the
 * other's rows. So somebody postponed a shipment, went looking in the
 * screen whose name they knew, did not find it, and reported a working
 * feature as broken.
 *
 * Fixed by naming, not by merging: two lists that belong to two jobs stay
 * two lists, and the one that shares a word gets a fuller name. The tab
 * also carries a count, so a held order can never LOOK like it vanished.
 */

const screen = () => stripComments(repoFile('src/components/screens/ShipmentsNewScreen.tsx'));

describe('postponing a shipment', () => {
  it('still demands a date, and says why', () => {
    const dialog = stripComments(repoFile('src/components/ops/DelayShipmentDialog.tsx'));
    expect(dialog).toContain('إلى متى؟');
    expect(dialog).toMatch(/type="date"/);
    // ONE outcome now, by the owner's ruling — and it still needs a date:
    // a postponement with no end is an order nothing brings back.
    expect(dialog).toMatch(/kind: 'POSTPONE'; until: string/);
    expect(dialog, 'عاد الخيار الثاني').not.toMatch(/kind: 'RELEASE'/);
  });

  it('and the tab it lands in cannot be mistaken for the other list', () => {
    const src = screen();
    expect(src).toContain('مؤجَّلة الشحن');
    // The bare word belonged to the menu screen, and taking it back is how
    // this gets reported again.
    expect(src, 'التبويب يحمل الاسمَ نفسَه الذي في القائمة').not.toMatch(/'held', 'مؤجَّلة'\]/);

    const menu = ALL_ROUTES.find((r) => r.path === '/confirmation/postponed');
    expect(menu?.label).toBe('الطلبات المؤجلة');
  });

  it('and the tab says how many are being held', () => {
    const src = screen();
    expect(src).toMatch(/setHeldCount\(data\.heldCount \?\? 0\)/);
    expect(src).toMatch(/k === 'held' && heldCount > 0/);

    // Counted on the server over everything held, not over the rows that
    // happen to be on screen — the ready view holds none of them.
    const api = stripComments(repoFile('src/app/api/ops/shipments/route.ts'));
    expect(api).toMatch(/const heldCount = await db\.order\.count\(\{/);
    expect(api).toMatch(/shipHoldUntil: \{ not: null \}/);
  });

  it('and the message names where it went, and what became of the goods', () => {
    // It no longer says «محجوزٌ له» — the goods go back on sale for the
    // length of the postponement, which is the half of the ruling a toast
    // is the last chance to tell somebody.
    expect(screen()).toMatch(/مؤجَّل حتى[\s\S]{0,80}عادت للبيع/);
    expect(screen(), 'ما زال يَعِد بحجز البضاعة').not.toContain('محجوزٌ له حتى');
  });
});
