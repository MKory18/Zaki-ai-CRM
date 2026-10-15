import { describe, expect, it } from 'vitest';
import { EMPTY_LAYOUT, parseLayout, resolveLayout, type NavLayout } from './nav-arrangement';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A VIEW THE OWNER PUBLISHES IS A QUESTION, NEVER AN ANSWER.
 *
 * «المتأخرة أكثر من عشرة أيام، أرامكس، إربد» is what somebody opens the
 * orders screen to see every morning, and setting it costs six controls
 * before any work starts. A person's own views already live in their
 * browser. This is the other half: a view HE publishes to a ROLE, so a new
 * agent's first morning already has the question their job is about.
 *
 * ── AND IT CANNOT WIDEN WHAT THAT ROLE SEES ──
 *
 * The definition of done names this as the thing to prove. It is true by
 * construction and the construction is worth holding: a view is a NAME and
 * a QUERY STRING, and applying one re-asks `GET /api/orders`, which applies
 * the same visibility envelope it always has. So the most a crafted or
 * careless view can do is ask for rows the server then refuses to return.
 *
 * What would break that is a view carrying an ANSWER — ids, rows, counts —
 * because then the screen would be showing data that never passed the
 * envelope. The claims below hold exactly that line.
 * ═══════════════════════════════════════════════════════════════════════
 */

describe('a stored view', () => {
  it('keeps a name and a query, and nothing else', () => {
    const layout = parseLayout({
      order: [],
      hidden: [],
      pinned: [],
      views: [
        {
          name: 'المتأخرة',
          query: 'state=SHIPPED&late=1',
          // Everything below is what a view must never carry.
          orderIds: ['o1', 'o2'],
          rows: [{ customer: 'أبو محمد', phone: '0791234567' }],
          count: 42,
        },
      ],
    });
    expect(layout.views).toEqual([{ name: 'المتأخرة', query: 'state=SHIPPED&late=1' }]);
    expect(JSON.stringify(layout), 'العرض حمل جواباً لا سؤالاً').not.toContain('0791234567');
  });

  it('and a half-written one is dropped rather than half-read', () => {
    const layout = parseLayout({
      order: [],
      hidden: [],
      pinned: [],
      views: [{ name: 'بلا استعلام' }, { query: 'بلا اسم' }, null, 7, { name: 'صحيح', query: 'x=1' }],
    });
    expect(layout.views).toEqual([{ name: 'صحيح', query: 'x=1' }]);
  });

  it('and is capped — a stored list is not a place to put a thousand', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `v${i}`, query: `i=${i}` }));
    expect(parseLayout({ order: [], hidden: [], pinned: [], views: many }).views).toHaveLength(12);
  });

  it('and a long name or query is cut, not refused', () => {
    // A refusal here would lose the other eleven views with it.
    const long = parseLayout({
      order: [],
      hidden: [],
      pinned: [],
      views: [{ name: 'ا'.repeat(200), query: 'q'.repeat(2000) }],
    });
    expect(long.views![0].name.length).toBe(40);
    expect(long.views![0].query.length).toBe(500);
  });
});

describe('the owner’s views and a person’s own', () => {
  const base: NavLayout = { ...EMPTY_LAYOUT, views: [{ name: 'المتأخرة', query: 'late=1' }] };
  const own: NavLayout = { ...EMPTY_LAYOUT, views: [{ name: 'إربد', query: 'region=irbid' }] };

  it('are both offered — views ADD, they do not replace', () => {
    /*
     * The other three lists replace: a person who reordered the menu has
     * said what they want and the base steps back. Views are different —
     * they answer different questions, and somebody who saved one of their
     * own has not thereby refused the owner's.
     */
    const r = resolveLayout(base, own);
    expect(r.views?.map((v) => v.name)).toEqual(['إربد', 'المتأخرة']);
  });

  it('and a name collision keeps the person’s own', () => {
    const clash: NavLayout = { ...EMPTY_LAYOUT, views: [{ name: 'المتأخرة', query: 'mine=1' }] };
    const r = resolveLayout(base, clash);
    expect(r.views).toHaveLength(1);
    expect(r.views![0].query, 'عرض المالك غطّى عرض الشخص').toBe('mine=1');
  });

  it('and with nothing of mine, the role’s published views stand', () => {
    expect(resolveLayout(base, null).views).toEqual(base.views);
  });
});

describe('and the door that publishes them', () => {
  const route = () => stripComments(repoFile('src/app/api/views/route.ts'));

  it('refuses a publish without the permission that edits roles', () => {
    const src = route();
    expect(src).toContain("can(user, 'roles.edit')");
    expect(src).toContain('PUBLISH_FORBIDDEN');
  });

  it('and refuses a role from another company', () => {
    // Without this the row would be written against this company and
    // belong to nobody.
    expect(route()).toMatch(/where:\s*\{\s*id:[\s\S]*?companyId[\s\S]*?companyId: null/);
  });

  it('and stores through the same reader the screen uses', () => {
    // So what is written is the shape that is read, with the same caps.
    expect(route()).toContain('parseLayout(');
  });

  it('and audits the NAMES, never the queries', () => {
    const src = route();
    const audit = src.slice(src.indexOf('VIEWS_PUBLISHED'));
    expect(audit.slice(0, 400)).toContain('.map((v) => v.name)');
  });
});
