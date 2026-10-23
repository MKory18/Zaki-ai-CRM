# notes.md — المرحلة ٢ «الدليل جوا النظام»

Working notes for this phase: the decisions that are not visible in a diff, and
the two that were already made by Phase 1 and are adopted here as-is.

## `tourDoneAt` is a column on the user, not a browser key

`users.tour_done_at` — nullable, **no default** — migration
`20261022000000_the_tour_once`, rollback alongside it. A tour that ran is a fact
about a *person*: somebody working from the counter and from a laptop is walked
through it once, and a browser they have never used does not walk them through it
a third time after they dismissed it on the first. `systemTheme` (migration
`20261016020000_the_systems_door`) is the precedent.

No default on purpose: `ADD COLUMN … DEFAULT now()` would mark every existing
user as having seen a tour that has never shipped, and would be a data rewrite
dressed as a schema change. Null means *it has not run*.

The door is `PATCH /api/profile/tour`, and it is PATCH-only: it writes the
caller's own row and takes no id from the body. There is deliberately **no
DELETE and no "show it again" endpoint** — a tour somebody can be walked through
again by an endpoint is a tour that can ambush a person who already said no.

Skip semantics, because they are two different acts:

| act | what is written | next sign-in |
| --- | --- | --- |
| «تخطّي» with the checkbox unchecked | nothing | it greets again — skipped, not refused |
| «تخطّي» with «ما بدي أشرح مرة ثانية» checked | `tour_done_at = now()` | never again |
| finishing the last step («خلصت») | `tour_done_at = now()` | never again |

A failed PATCH closes the card and costs one extra tour next sign-in; it never
leaves a stuck overlay over a new user's first morning.

## `EmptyState` — the API Phase 1 already shipped, adopted unchanged

`src/components/ui/EmptyState.tsx` exists and is used by ~37 screens. Its props
are:

```tsx
<EmptyState
  icon={RiArchiveDrawerLine}          // the glyph that names the subject
  title="لا طلبات مؤكدة بانتظار التجهيز" // WHAT is missing, in the words of the work
  why="الطلب يظهر هنا بعد أن يُؤكَّد…"   // WHY it is missing — one calm sentence
  action={{ label: 'افتح المحافظات', href: '/finance/wallets' }} // optional: the one thing that changes it
/>
```

The phase-2 spec described the shape as `{title, body, icon, action}`. **The prop
is `why`, not `body`**, and it is not being renamed: a rename would touch every
call site to buy nothing, and `body` is the vaguer word — the sentence is a
*reason*, which is exactly the part a bare «لا توجد…» leaves out. `action` takes
either `{label, onClick}` or `{label, href}`.

There is one empty-state component. No illustration component, no second
`EmptyState`, no wrapper.

## The ⓘ stays the only explainer

`ScreenGuide.tsx` is canonical: `GuideButton` + `ScreenGuideProvider` hang the
per-screen text off the screen title, and `route-guide.ts` / `route-guide-texts.ts`
hold the index and the prose. The first-run tour introduces *the frame* (menu,
store, search, the ⓘ itself) and shares no code with the sheet. It is not a
second tooltip system; it is one overlay that runs once.

Coverage check, re-run when a route is added:

```
registry r('…') paths  vs  GUIDE_TEXTS keys
```

today: 55 routes, 53 with guides — the two without are `/store` and
`/store/landing-pages`, which belong to the storefront agent and are exempt by
`route-guide.ts` and by `the-screen-explains-itself.test.tsx`.

## The tour's anchors are names, not pixels

`data-tour="sidebar" | "context" | "search" | "guide"` on the real elements
(`Sidebar.tsx`, the store chip in `Header.tsx`, the palette trigger, the ⓘ in
`ScreenGuide.tsx`). A step whose element is not on the screen — a phone folds the
sidebar, a screen without a guide has no ⓘ — is skipped rather than drawn against
empty air.
