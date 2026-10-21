import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A LIST THAT STOPS AT TWO HUNDRED IS A LIST THAT LIES ABOUT THE REST.
 *
 * The owner, 20/10: «المرتجعات صفحات اعملها».
 *
 * `/api/ops/returns` took `take: 200` with no page. And the order is
 * `returnedAt` ASCENDING — oldest first, which is right, because the
 * return that has sat longest is the one costing money. Together they
 * meant the two hundred shown were the two hundred OLDEST, and a shop
 * past that number could not reach a return that came back yesterday **at
 * all**. Not «slow to find»: unreachable, with nothing on the screen
 * saying so.
 *
 * ── AND THE COUNT HAS TO ASK THE SAME QUESTION AS THE ROWS ──
 *
 * The heading says «عرض ١٢ من ٨٧». If the count is taken over a
 * different `where` than the rows, that sentence is two facts about two
 * lists — and it is the sentence a returns desk reads to decide whether
 * it is nearly done. One named predicate, both readers.
 * ═══════════════════════════════════════════════════════════════════════
 */

const route = () => stripComments(repoFile('src/app/api/ops/returns/route.ts'));
const screen = () => stripComments(repoFile('src/components/screens/ReturnsScreen.tsx'));
/*
 * THE PAGE ARITHMETIC MOVED, AND THESE PINS WENT WITH IT.
 *
 * The door used to count, clamp and take the page inline, and the screen used to carry its own loader, its own
 * page ref and its own pager. «صفحات + فلاتر + بحث» wrote all of that four times, so it is written once now:
 * `readOrderPage` (lib/paged-read.ts) for the door, `usePagedList` and `Pager` for the screen. What these
 * claims say is unchanged — no ceiling, one question for the count and the rows, a clamped page, a pager only
 * when there is a second page; where each is HELD is `paged-read.test.ts` and `the-list-kit.test.tsx`, which
 * run it, and `the-returns-screen-filters-and-finds.test.tsx`, which turns the pages on screen.
 */
const reader = () => stripComments(repoFile('src/lib/paged-read.ts'));
const hook = () => stripComments(repoFile('src/hooks/usePagedList.ts'));

describe('the returns door hands out pages', () => {
  it('— and no longer cuts the list at a number nobody could see past', () => {
    const src = route();
    expect(src, 'السقف الثابت رجع').not.toMatch(/take:\s*200/);
    expect(src).toContain('readOrderPage');
    expect(reader()).toMatch(/skip:\s*\(page - 1\) \* input\.limit/);
    expect(reader()).toMatch(/take:\s*input\.limit/);
  });

  it('and reads the page through the shared readers, like every other paged door', () => {
    /*
     * `readPage`/`readLimit` are what make `?page=abc` and `?page=1e400`
     * fall to page one here exactly as they do on the orders, customers
     * and reviews doors — and `a-page-number-is-not-a-crash.test.ts`
     * holds that rule for all of them.
     */
    const src = route();
    expect(src).toContain('readPage(searchParams)');
    expect(src).toContain('readLimit(searchParams');
  });

  it('and the count asks the same question as the rows', () => {
    // One named predicate, both readers — or the heading is a fact about
    // a different list than the one under it.
    // The door hands ONE `where` to the reader, and the reader hands that same object to both calls.
    expect(route()).toMatch(/const where = \{ \.\.\.viewScope\(parsed\.view, scope\), AND: parsed\.clauses \}/);
    expect(route()).toMatch(/readOrderPage<.*>\(db, \{\s*where,/);
    expect(reader()).toMatch(/count\(\{ where: input\.where \}\)/);
    expect(reader()).toMatch(/findMany\(\{\s*where: input\.where/);
  });

  it('and a page past the end is clamped, not answered with emptiness', () => {
    /*
     * Asking for page 9 of 3 is what a bookmark becomes once the queue is
     * worked down. An empty screen reads as «there are no returns», which
     * is a lie about the three on page 3.
     */
    expect(reader()).toMatch(/Math\.min\(Math\.max\(input\.page, 1\), totalPages\)/);
  });

  it('and says how many there are, not only how many are on this page', () => {
    const src = route();
    expect(src).toMatch(/pagination: \{ total: list\.total, page: list\.page, limit: list\.limit, totalPages: list\.totalPages \}/);
    // `count` stays: it is what is ON the page, a different fact.
    expect(src).toMatch(/count: orders\.length/);
  });
});

describe('and the screen turns them', () => {
  it('— the clerk can reach page two', () => {
    const src = screen();
    expect(src).toContain('pagination.totalPages');
    // The bar's two arrows call back with the page they want; the screen hands it the hook's `goTo`.
    expect(src).toContain('onPage={list.goTo}');
  });

  it('and the arrows are drawn only when there IS a second page', () => {
    // «صفحة ١ من ١» over two dead arrows is furniture telling a clerk
    // with eleven returns nothing at all.
    expect(screen()).toMatch(/\{pagination\.totalPages > 1 &&/);
  });

  it('and a new search starts at page one, while coming back does not', () => {
    /*
     * Two different questions. Page seven of a different search is not
     * where the reader was — but returning to the tab must reload the
     * page they are ON, or a clerk reading page three is thrown to the
     * top every time they look away.
     */
    // Both answers are the hook's: a change of choice starts at page one, and coming back reloads the page you are on.
    expect(screen()).toContain('usePagedList');
    expect(hook()).toMatch(/setTimeout\(\(\) => void load\(1\), wait\)/);
    expect(hook()).toMatch(/useLiveRefresh\(\(\) => loadRef\.current\(pageRef\.current\)/);
  });

  it('and the page it refreshes is read from a ref, not from a closure', () => {
    // The hook attaches its listeners once, so a page read through the
    // closure would be page one for ever.
    expect(hook()).toMatch(/pageRef\.current = pagination\.page;/);
  });
});
