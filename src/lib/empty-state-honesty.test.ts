import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * AN EMPTY LIST AND A HIDDEN ONE ARE NOT THE SAME SENTENCE.
 *
 * Three lists in the confirmation slice answered «there is nothing» when the
 * truth was «your search matched nothing» — which is the one sentence that
 * makes somebody stop looking:
 *
 *   /control/blacklist  — «لا أرقام محظورة.» was read off `activeCount`,
 *   which the route computes over the SEARCHED rows. Type a number nobody
 *   blocked and a screen holding a full blacklist announced that the
 *   blacklist was empty. The paragraph also short-circuited the list, so the
 *   `Rows` empty state below it — the one with a reason in it — could never
 *   render at all: two empty states, and the worse one won.
 *
 *   /confirmation/mine — both sections. «لا يوجد طلب بيدك الآن» while the
 *   heading beside it said «0 من 11», and the CONFIRMED list carried the
 *   OTHER section's copy, telling her to «اسحب طلباً من الطابور» about a
 *   list of orders she had already confirmed.
 */

describe('the blacklist', () => {
  const src = () => repoFile('src/components/screens/BlacklistScreen.tsx');

  it('has one empty state, reachable — not a paragraph shadowing the list', () => {
    const body = stripComments(src());
    // The list is always rendered; only loading short-circuits it.
    expect(body).not.toContain('لا أرقام محظورة.');
    expect(body).not.toContain('لا نتائج مطابقة.');
    expect(body).toMatch(/<Rows/);
  });

  it('says WHICH of the three things is true', () => {
    const body = src();
    expect(body).toContain('searching ? (');
    expect(body).toContain('لا نتائج مطابقة');
    expect(body).toContain('releasedHidden ? (');
    expect(body).toContain('لا حظرَ سارياً الآن');
    expect(body).toContain('لا أرقامَ محظورة');
  });

  it('and works out «searching» from the box, not from a count the server filtered', () => {
    const body = stripComments(src());
    expect(body).toContain('const searching = term.trim().length > 0');
    expect(body, 'عدٌّ محسوبٌ على نتيجة البحث').not.toContain('activeCount');
  });

  it('is a whole screen', () => {
    expect(src().length).toBeGreaterThan(2000);
  });
});

describe('«طلباتي»', () => {
  const src = () => repoFile('src/components/screens/ConfirmationMineScreen.tsx');

  it('tells the in-confirmation section apart from a search that matched nothing', () => {
    const body = src();
    expect(body).toContain("findOpen.trim() ? (");
    expect(body).toContain('لا طلبَ بيدك يطابق هذا البحث');
    expect(body).toContain('لا يوجد طلب بيدك الآن');
  });

  it('gives the confirmed section its own words, not the other section’s', () => {
    const body = src();
    expect(body).toContain("findDone.trim() ? (");
    expect(body).toContain('لا طلبَ مؤكَّداً يطابق هذا البحث');
    expect(body).toContain('لم تؤكّد طلباً بعد');
    // The copy that used to sit under the confirmed list belonged above it.
    expect(
      (body.match(/اسحب طلباً من الطابور/g) ?? []).length,
      'نصُّ القسم الأعلى ما زال تحت القسم الأسفل'
    ).toBeLessThanOrEqual(1);
  });

  it('offers a way out of the search it is reporting', () => {
    const body = src();
    expect(body).toMatch(/label: 'امسح البحث', onClick: \(\) => setFindOpen\(''\)/);
    expect(body).toMatch(/label: 'امسح البحث', onClick: \(\) => setFindDone\(''\)/);
  });

  it('is a whole screen, with its actions still on it', () => {
    expect(src().length).toBeGreaterThan(2000);
    expect(src()).toContain('تأكيد الطلب');
  });
});
