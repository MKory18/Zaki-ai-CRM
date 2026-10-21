import type { NavGroup } from './route-registry';

/**
 * THE MENU, ARRANGED — AND WHY ARRANGING OPENS NOTHING.
 *
 * The owner, 15/10: «تصميم الموقع حتى الـ OMS لإلي وللموظفين خرى ومش سهل،
 * وما بقدر أتحكم بالقوائم والنوافذ». His decision: HE sets the base per
 * role, each person adjusts on top of it, and «رجّع الأساس» brings the base
 * back.
 *
 * ── ARRANGING IS COSMETIC, AND THAT IS A RULE, NOT A HOPE ──
 *
 * Nothing in this file decides who may open a screen. The menu it arranges
 * has ALREADY been filtered by `visibleNav`, which asks `canAccessRoute`
 * per route — and every door checks its own permission on the server when
 * it is opened. So hiding an item removes it from a list and nothing else:
 * typing the URL is refused exactly as it was before, and unhiding grants
 * nobody anything. The one thing this must never do is ADD a route, and
 * `apply` cannot: it only reorders and filters what it was handed.
 *
 * ── A LAYOUT IS THREE LISTS OF PATHS, AND NOTHING ELSE ──
 *
 * Paths, because they are what the registry already keys on and what a URL
 * already is: a layout stored last month still means something after a
 * screen is renamed, and a route that no longer exists is simply absent
 * from the groups and so falls out.
 *
 * And a layout is never the whole menu: it is a PREFERENCE over it. A
 * route added to the registry next week is in nobody's `order`, so it
 * appears at the end of its group — present, for everyone, without
 * anybody's stored arrangement having to be migrated. That is the edge
 * case the brief names, and it falls out of taking the registry as the
 * source and the layout as the opinion.
 */

export interface NavLayout {
  /** Paths in the order they should appear. Unlisted ones keep registry order, after. */
  order: string[];
  /** Paths to leave out of the menu. Cosmetic — the door is still guarded. */
  hidden: string[];
  /** Paths to lift to the top of their group. */
  pinned: string[];
  /**
   * NAMED FILTER SETS, FOR A SURFACE THAT HAS THEM — a published view.
   *
   * «المتأخرة أكثر من عشرة أيام، أرامكس، إربد» is what somebody opens the
   * orders screen to see every morning, and it costs six controls before
   * any work starts. A person's own views live in their browser
   * (`SavedViews`); this is the other half the owner asked for — a view HE
   * publishes to a role, so a new agent's first morning already has it.
   *
   * ── A VIEW IS A QUESTION, NEVER AN ANSWER ──
   *
   * It is a query string and a name. No results, no counts, no record ids
   * — nothing about any customer, and nothing that could still be true
   * when the data has moved on. Applying one re-asks the question through
   * the same API, which applies the same scope envelope it always did. So
   * a published view CANNOT widen what a role sees: the most it can do is
   * ask for rows the server then refuses to return.
   */
  views?: { name: string; query: string }[];
}

export const EMPTY_LAYOUT: NavLayout = { order: [], hidden: [], pinned: [] };

/**
 * A stored layout, read defensively.
 *
 * It arrives as JSON from a column, so it can be anything: a half-written
 * value, a shape from an older build, `null`. A menu is the one thing that
 * must not fail to render — losing it means the person cannot reach any
 * screen at all — so every field falls back to empty rather than throwing.
 */
export function parseLayout(raw: unknown): NavLayout {
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return EMPTY_LAYOUT;
    }
  }
  if (!value || typeof value !== 'object') return EMPTY_LAYOUT;
  const o = value as Record<string, unknown>;
  /*
   * The views, read as defensively as the three lists: a name and a query,
   * both strings, and nothing else kept. A stored view carrying a third
   * field would be a shape from a build that is not this one.
   */
  const views = Array.isArray(o.views)
    ? o.views
        .filter(
          (v): v is { name: string; query: string } =>
            !!v &&
            typeof v === 'object' &&
            typeof (v as { name?: unknown }).name === 'string' &&
            typeof (v as { query?: unknown }).query === 'string'
        )
        .slice(0, 12)
        .map((v) => ({ name: v.name.slice(0, 40), query: v.query.slice(0, 500) }))
    : [];
  return {
    order: strings(o.order),
    hidden: strings(o.hidden),
    pinned: strings(o.pinned),
    ...(views.length > 0 ? { views } : {}),
  };
}

/**
 * The role's base, then the person's own on top.
 *
 * Each list is answered by the person when they have said anything about
 * it, and by the base otherwise — PER LIST, not per field of a merged
 * object. A person who reordered but hid nothing keeps the role's hidden
 * items, which is the whole point of a base: the owner's decision stands
 * where the person has not made one.
 *
 * `null` for a person's layout — never saved, or «رجّع الأساس» pressed —
 * is therefore the base, exactly.
 */
export function resolveLayout(base: NavLayout | null, own: NavLayout | null): NavLayout {
  const b = base ?? EMPTY_LAYOUT;
  const o = own ?? EMPTY_LAYOUT;
  return {
    order: o.order.length > 0 ? o.order : b.order,
    hidden: o.hidden.length > 0 ? o.hidden : b.hidden,
    pinned: o.pinned.length > 0 ? o.pinned : b.pinned,
    /*
     * Views are the one list that ADDS rather than replaces: the owner's
     * published views and a person's own are both offered, because they
     * answer different questions and a person who saved one of their own
     * has not thereby refused his. The person's come first — they chose
     * them — and a name collision keeps theirs.
     */
    ...(() => {
      const mine = o.views ?? [];
      const theirs = (b.views ?? []).filter((v) => !mine.some((m) => m.name === v.name));
      const all = [...mine, ...theirs];
      return all.length > 0 ? { views: all } : {};
    })(),
  };
}

/**
 * The groups as the menu should draw them.
 *
 * Order inside a group: pinned first (in the layout's own order), then the
 * rest by `order`, then whatever the layout never mentions — in registry
 * order, at the end.
 *
 * A group left with nothing visible is dropped, the same way `visibleNav`
 * drops a group a role cannot enter: an empty heading is a dead row.
 */
export function applyArrangement(groups: NavGroup[], layout: NavLayout | null): NavGroup[] {
  if (!layout) return groups;
  const hidden = new Set(layout.hidden);
  const pinned = new Set(layout.pinned);
  const rank = new Map(layout.order.map((path, i) => [path, i]));

  return groups
    .map((group) => {
      const kept = group.routes.filter((r) => !hidden.has(r.path));
      const sorted = kept
        .map((route, i) => ({ route, i }))
        .sort((a, b) => {
          const ap = pinned.has(a.route.path) ? 0 : 1;
          const bp = pinned.has(b.route.path) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          const ar = rank.get(a.route.path);
          const br = rank.get(b.route.path);
          // Unmentioned routes go last, among themselves in registry order.
          if (ar === undefined && br === undefined) return a.i - b.i;
          if (ar === undefined) return 1;
          if (br === undefined) return -1;
          return ar - br;
        })
        .map(({ route }) => route);
      return { ...group, routes: sorted };
    })
    .filter((g) => g.routes.length > 0);
}

/**
 * A layout kept to the paths that still exist.
 *
 * Saved when the person presses save, so a stored layout does not grow a
 * tail of paths from screens that were removed — and so a path somebody
 * posted by hand, for a screen they may not open, is dropped instead of
 * stored. It cannot grant anything either way (see the note at the top),
 * but a store that holds only real paths is a store that can be read.
 */
export function cleanLayout(layout: NavLayout, allowed: readonly string[]): NavLayout {
  const ok = new Set(allowed);
  return {
    order: layout.order.filter((p) => ok.has(p)),
    hidden: layout.hidden.filter((p) => ok.has(p)),
    pinned: layout.pinned.filter((p) => ok.has(p)),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MOVING ONE SCREEN, WITHIN ITS OWN GROUP — BY BUTTON OR BY HAND.
 *
 * The menu arrangement had two buttons per row, up and down, and the owner
 * asked for dragging («سحب وإفلات»). The reasons it had been deferred are in
 * `MenuOrderCard`: a drag needs pointer, touch and keyboard paths to be
 * equal, and on a 390px screen a drag inside a scrolling column fights the
 * scroll. Both are answered there, by a library built for exactly that and by
 * keeping the buttons.
 *
 * What is HERE is the part that is the same whichever way it was moved: given
 * the whole menu's order and one group, where does the screen end up. Pure
 * and free of any drag library, so the buttons and the drag run through ONE
 * function and cannot disagree about what «move this one down» means.
 *
 * ── WITHIN ITS OWN GROUP, AND THAT IS A RULE ──
 *
 * A screen does not change what it is about by being dragged under another
 * heading. It was true of the buttons, which cannot leave the group, and it
 * stays true of the drag: each group is its own drop zone, and a drop that
 * names something outside the group moves nothing.
 *
 * ── AND ONE GROUP NEVER RESHUFFLES ANOTHER ──
 *
 * `order` is a flat list of paths across the whole menu (see `NavLayout`),
 * and a group is sorted by the rank of its own members. So the new order is
 * «everything before this group, then this group in its new order, then
 * everything after» — the other groups' paths keep their places exactly.
 * ═══════════════════════════════════════════════════════════════════════
 */
export function reorderWithinGroup(
  flat: readonly string[],
  group: readonly string[],
  from: number,
  to: number
): string[] {
  const last = group.length - 1;
  // Nothing to do, or an index that is not in the group: leave the menu as it was.
  if (from === to || from < 0 || to < 0 || from > last || to > last) return [...flat];

  const moved = [...group];
  const [one] = moved.splice(from, 1);
  moved.splice(to, 0, one);

  const inGroup = new Set(group);
  const outside = flat.filter((p) => !inGroup.has(p));
  // How many of the others sit before this group's first member — those keep
  // their place, and the group goes in right after them.
  const firstAt = flat.findIndex((p) => inGroup.has(p));
  const before = firstAt < 0 ? outside.length : flat.slice(0, firstAt).filter((p) => !inGroup.has(p)).length;
  return [...outside.slice(0, before), ...moved, ...outside.slice(before)];
}

/** The two things a finished drag tells us, as the drag library reports them. */
export interface DragEnd {
  active: { id: string | number };
  over: { id: string | number } | null;
}

/**
 * The new order after a drag — or `null` when nothing moved.
 *
 * `null` for a drop on nothing, a drop on yourself, and a drop on something
 * that is not in this group (which a per-group drop zone cannot produce, and
 * which is refused here regardless: the rule does not depend on the library
 * being set up right).
 */
export function orderAfterDrag(
  flat: readonly string[],
  group: readonly string[],
  end: DragEnd
): string[] | null {
  if (!end.over || end.over.id === end.active.id) return null;
  const from = group.indexOf(String(end.active.id));
  const to = group.indexOf(String(end.over.id));
  if (from < 0 || to < 0) return null;
  return reorderWithinGroup(flat, group, from, to);
}
