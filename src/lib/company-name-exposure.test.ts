import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * WHAT THE SETTINGS SCREEN PROMISES ABOUT THE COMPANY NAME.
 *
 * The owner asked, on paper: «اسم الشركة، هل هو اسم المتجر؟ إذا نعم
 * ألغيه. إذا لا، إذاً شو هو وخليه فعال».
 *
 * It is not the store name — a company here owns several stores, and each
 * carries its own name and logo on its pages. But the screen also told him
 * flatly «لا يظهر هذا الاسم لزبائنك», and that was not true:
 * /api/public/landing-pages/[slug]/meta is a public, CORS-open endpoint
 * that answers with `company.name` to anybody holding a published page's
 * slug.
 *
 * The key stays, because that endpoint's own comment records that embeds
 * already pasted on sellers' sites read this shape. What changed is the
 * promise. A reassurance that is not true is worse than no reassurance —
 * so this guard holds the two in step: while the endpoint sends the name,
 * the screen must say so.
 */

const meta = () => stripComments(repoFile('src/app/api/public/landing-pages/[slug]/meta/route.ts'));
const screen = () => stripComments(repoFile('src/components/screens/SystemSettingsScreen.tsx'));

describe('the company name and the public endpoint', () => {
  it('the endpoint is public and still answers with the company name', () => {
    const src = meta();
    expect(src).toMatch(/company: \{ name: lp\.company\.name/);
    expect(src, 'صار محميّاً بجلسة').toMatch(/'Access-Control-Allow-Origin': '\*'/);
  });

  /**
   * THE ONE THAT MATTERS. If somebody removes the name from that endpoint
   * later, this test should be what tells them the screen's wording can
   * now be strengthened — and if somebody weakens the wording back to the
   * flat promise while the endpoint still sends it, it fails.
   */
  it('so the screen says where it travels, and does not promise privacy', () => {
    const src = screen();
    expect(src, 'الوعدُ المسطَّح عاد').not.toMatch(/لا يظهر هذا الاسم لزبائنك/);
    expect(src).toMatch(/بياناتُ التضمين/);
  });

  it('and it says plainly that it is not the store name', () => {
    expect(screen()).toMatch(/لا اسمُ متجرك/);
  });
});
