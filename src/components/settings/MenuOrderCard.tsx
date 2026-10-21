'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { THEME_CHOICES } from '@/lib/system-themes';
import { Select } from '@/components/ui/Input';
import { ALL_ROUTES, NAV } from '@/lib/route-registry';
import { applyArrangement, EMPTY_LAYOUT, orderAfterDrag, reorderWithinGroup, type NavLayout } from '@/lib/nav-arrangement';
import type { RouteDef } from '@/lib/route-registry';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiDraggable,
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiPushpinLine,
} from '@remixicon/react';

/**
 * «ترتيب القائمة» — the menu, arranged by the person who reads it.
 *
 * The owner, 15/10: «ما بقدر أتحكم بالقوائم والنوافذ». He sets the base per
 * role; each person adjusts on top of it; «رجّع الأساس» brings the base
 * back.
 *
 * ── DRAG, AND THE BUTTONS ARE STILL THERE ──
 *
 * This shipped with up and down buttons and dragging was recorded (RV46) as
 * the nicer surface over the same stored shape — deferred for two honest
 * reasons: a drag needs pointer, touch and keyboard paths to be equal, and
 * on a 390 px screen a drag inside a scrolling column fights the scroll.
 *
 * Dragging is here now (the owner asked for it by name: «سحب وإفلات»), and
 * the two reasons are answered rather than waved away:
 *
 *   • the engine is `@dnd-kit`, which carries a pointer sensor and a keyboard
 *     sensor with Arabic announcements for a screen reader — Space to pick a
 *     row up, the arrows to move it, Space to put it down, Esc to cancel;
 *   • the drag starts ONLY from a handle, and the handle alone has
 *     `touch-action: none`. A thumb on the rest of the row scrolls the page
 *     exactly as before, so the scroll is never fought, only the grip is.
 *
 * And the buttons stay. A drag is a pointer's surface; the arrows are what a
 * thumb on a phone, a keyboard and a screen reader reach on the first day,
 * and removing them to make room for the nicer control would have traded the
 * accessible path for the pleasant one. Both go through the SAME function —
 * `reorderWithinGroup` — so they cannot disagree about what a move means.
 *
 * ── AND ARRANGING OPENS NOTHING ──
 *
 * The list below is the viewer's OWN menu, as the server built it. Hiding
 * removes a row from a list; the door is still checked when it is opened,
 * and a hidden screen reached by its URL is refused exactly as before.
 */
/** Every screen's name, by path — what the announcements say instead of an address. */
const ALL_LABELS = new Map(ALL_ROUTES.map((r) => [r.path, r.label]));

export function MenuOrderCard() {
  const [layout, setLayout] = useState<NavLayout>(EMPTY_LAYOUT);
  const [paths, setPaths] = useState<string[]>([]);
  const [hasOwn, setHasOwn] = useState(false);
  const [maySetRoleBase, setMayRole] = useState(false);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  /** Empty = «my own menu». A role id = «الترتيب لـ: <دور>». */
  const [forRole, setForRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiJson<{
      resolved: NavLayout;
      own: NavLayout | null;
      paths: string[];
      maySetRoleBase: boolean;
    }>('/api/nav/arrangement')
      .then((d) => {
        if (!alive) return;
        setLayout(d.resolved);
        setPaths(d.paths);
        setHasOwn(d.own !== null);
        setMayRole(d.maySetRoleBase);
        if (d.maySetRoleBase) {
          void apiJson<{ roles: { id: string; name: string }[] }>('/api/roles')
            .then((r) => alive && setRoles(r.roles ?? []))
            .catch(() => {});
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'تعذّر القراءة'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  /** The groups as the menu draws them now — the same function the server uses. */
  const mine = NAV.map((g) => ({ ...g, routes: g.routes.filter((r) => paths.includes(r.path)) })).filter(
    (g) => g.routes.length > 0
  );
  /*
   * Shown WITH the hidden rows, because this is the screen where they are
   * brought back: `applyArrangement` would drop them, and a hidden item
   * nobody can see is a hidden item nobody can unhide.
   */
  const ordered = applyArrangement(
    mine,
    { ...layout, hidden: [] }
  );

  const isHidden = (path: string) => layout.hidden.includes(path);
  const isPinned = (path: string) => layout.pinned.includes(path);

  /** Every path in draw order, which is what `order` stores. */
  const flat = ordered.flatMap((g) => g.routes.map((r) => r.path));

  function move(path: string, by: -1 | 1) {
    const group = ordered.find((g) => g.routes.some((r) => r.path === path));
    if (!group) return;
    const within = group.routes.map((r) => r.path);
    const at = within.indexOf(path);
    // Inside its own group only — `reorderWithinGroup` leaves the menu as it
    // was for an index outside it, which is what pressing «up» on the first
    // row asks for.
    setLayout({ ...layout, order: reorderWithinGroup(flat, within, at, at + by) });
  }

  /** A finished drag: the same function, asked by hand instead of by button. */
  function dropped(groupPaths: string[], end: DragEndEvent) {
    const next = orderAfterDrag(flat, groupPaths, end);
    if (next) setLayout({ ...layout, order: next });
  }

  // One set of sensors for the whole card. Six pixels before a press becomes a
  // drag, so a tap on the handle (or a shaky one) is not a move; and the
  // keyboard sensor walks the rows by their own order.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggle = (key: 'hidden' | 'pinned', path: string) =>
    setLayout({
      ...layout,
      [key]: layout[key].includes(path) ? layout[key].filter((p) => p !== path) : [...layout[key], path],
    });

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = { ...layout, order: flat };
      await apiJson(`/api/nav/arrangement${forRole ? `?roleId=${forRole}` : ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNotice(
        forRole
          ? 'انحفظ أساس الدور. كلّ واحد فيه بيشوفه إلا إذا رتّب لحاله.'
          : 'انحفظ ترتيبك. حدّث الصفحة لتشوف القائمة بترتيبها الجديد.'
      );
      if (!forRole) setHasOwn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const d = await apiJson<{ resolved: NavLayout }>('/api/nav/arrangement', { method: 'DELETE' });
      setLayout(d.resolved);
      setHasOwn(false);
      setNotice('رجع الأساس. القائمة صارت زي ما ضبطها المالك لدورك.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الإرجاع');
    } finally {
      setBusy(false);
    }
  }

  async function loadRole(id: string) {
    setForRole(id);
    setNotice(null);
    if (!id) {
      const d = await apiJson<{ resolved: NavLayout }>('/api/nav/arrangement');
      setLayout(d.resolved);
      return;
    }
    const d = await apiJson<{ layout: NavLayout }>(`/api/nav/arrangement?roleId=${id}`, { method: 'POST' });
    setLayout(d.layout);
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-[var(--sys-muted)]">
        <RiLoader4Line className="w-4 h-4 animate-spin inline-block" />
      </div>
    );
  }

  return (
    // `id` is where the sidebar's «رتّب القائمة» link lands (`/admin/profile#menu-order`).
    <div dir="rtl" id="menu-order" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black text-[var(--sys-foreground)]">ترتيب القائمة</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            رتّب قائمتك: اسحب الصف من المقبض، أو استعمل السهمين. ثبّت أو اخفِ ما لا تستعمله. الإخفاء لا يفتح ولا يغلق أي صلاحية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasOwn && !forRole && (
            <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
              رجّع الأساس
            </Button>
          )}
          <Button size="sm" onClick={save} loading={busy}>
            احفظ
          </Button>
        </div>
      </div>

      {maySetRoleBase && (
        <Card>
          <CardContent>
            <label className="block text-xs text-[var(--sys-muted-foreground)] mb-1">الترتيب لـ</label>
            <Select value={forRole} onChange={(e) => void loadRole(e.target.value)}>
              <option value="">قائمتي أنا</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  أساس الدور: {r.name}
                </option>
              ))}
            </Select>
            {forRole && (
              <>
                <p className="mt-1.5 text-xs text-[var(--sys-warning)]">
                  هذا أساس الدور — بيشوفه كلّ واحد فيه إلا إذا رتّب لحاله.
                </p>
                {/*
                  AND THE LOOK THE ROLE OPENS ON, IN THE SAME PLACE.

                  The menu base and the opening theme are the same kind of
                  decision — what a new person in this role finds on their
                  first morning — set by the same permission. Two screens
                  for one decision is how one of them is never found.

                  ⚠️ It is a BASE, not a cage, and the sentence says so:
                  the moment that person picks a look of their own, this
                  stops being read for them.
                */}
                <RoleOpeningTheme roleId={forRole} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {notice && (
        <p className="text-xs text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-border)] rounded-lg px-2.5 py-1.5">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg px-2.5 py-1.5">
          {error}
        </p>
      )}

      {ordered.map((group) => {
        const groupPaths = group.routes.map((r) => r.path);
        return (
          <Card key={group.key}>
            <CardHeader title={group.label} />
            <CardContent>
              {/*
                ONE DROP ZONE PER GROUP.

                A screen does not change what it is about by being dragged
                under another heading, so each group is its own context: a
                row can be dropped among its own group and nowhere else, and
                `orderAfterDrag` refuses the rest again regardless. The
                vertical axis is locked and the row is kept inside the list,
                so a hand that drifts sideways does not lose the row.
              */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                onDragEnd={(end) => dropped(groupPaths, end)}
                accessibility={{ announcements: ANNOUNCEMENTS, screenReaderInstructions: INSTRUCTIONS }}
              >
                <SortableContext items={groupPaths} strategy={verticalListSortingStrategy}>
                  <ul className="divide-y divide-[var(--sys-border)]">
                    {group.routes.map((route, i) => (
                      <SortableRow
                        key={route.path}
                        route={route}
                        first={i === 0}
                        last={i === group.routes.length - 1}
                        hidden={isHidden(route.path)}
                        pinned={isPinned(route.path)}
                        onMove={(by) => move(route.path, by)}
                        onToggle={(key) => toggle(key, route.path)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** What a screen reader hears, in the user's own language and the screen's own names. */
const labelOf = (id: string | number) => ALL_LABELS.get(String(id)) ?? String(id);
const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `أمسكتَ «${labelOf(active.id)}».`,
  onDragOver: ({ active, over }) =>
    over && over.id !== active.id ? `«${labelOf(active.id)}» فوق «${labelOf(over.id)}».` : undefined,
  onDragEnd: ({ active, over }) =>
    over && over.id !== active.id
      ? `أُفلتت «${labelOf(active.id)}» مكان «${labelOf(over.id)}».`
      : `أُفلتت «${labelOf(active.id)}» في مكانها.`,
  onDragCancel: ({ active }) => `أُلغي تحريك «${labelOf(active.id)}».`,
};
const INSTRUCTIONS = {
  draggable:
    'لتغيير ترتيب هذه الشاشة: اضغط مسافة لتمسكها، ثم السهم لأعلى أو لأسفل، ثم مسافة لتفلتها. اضغط Esc للإلغاء.',
};

/**
 * ONE ROW: ITS GRIP, ITS NAME, AND THE FOUR BUTTONS IT ALWAYS HAD.
 *
 * The grip is the ONLY thing that starts a drag (`useSortable`'s listeners
 * are on it and nowhere else), and it alone carries `touch-action: none`.
 * That is the whole answer to «a drag inside a scrolling column fights the
 * scroll»: a thumb on the name, the buttons, or the gap between rows scrolls
 * the page exactly as it did before there was a grip.
 *
 * The row's own look while it is carried is INLINE — a lifted shadow, a
 * little transparency, above its neighbours — because the stylesheet is capped
 * to the byte and a drag state is not worth a utility class nothing else uses.
 */
function SortableRow({
  route,
  first,
  last,
  hidden,
  pinned,
  onMove,
  onToggle,
}: {
  route: RouteDef;
  first: boolean;
  last: boolean;
  hidden: boolean;
  pinned: boolean;
  onMove: (by: -1 | 1) => void;
  onToggle: (key: 'hidden' | 'pinned') => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: route.path,
    // The library announces the grip as «sortable» unless told otherwise — one
    // English word in the middle of an Arabic sentence for a screen reader.
    attributes: { roleDescription: 'مقبض ترتيب' },
  });

  return (
    <li
      ref={setNodeRef}
      className="flex items-center gap-2 py-2"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isDragging
          ? { position: 'relative', zIndex: 1, opacity: 0.85, background: 'var(--sys-card)', boxShadow: 'var(--sys-shadow-overlay)' }
          : null),
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`اسحب ${route.label} لتغيير ترتيبه`}
        title="اسحب لتغيير الترتيب"
        // The grip, and only the grip, refuses the browser's own scroll
        // gesture: this is what keeps the rest of the row scrollable.
        style={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
      >
        <RiDraggable className="w-4 h-4" />
      </button>
      <span
        className={
          hidden
            ? 'flex-1 text-sm text-[var(--sys-muted)] line-through'
            : 'flex-1 text-sm text-[var(--sys-heading)]'
        }
      >
        {route.label}
        {pinned && <span className="text-xs text-[var(--sys-primary)]"> · مثبّت</span>}
      </span>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={first}
        aria-label={`ارفع ${route.label}`}
        title="ارفع"
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)] disabled:opacity-40"
      >
        <RiArrowUpSLine className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={last}
        aria-label={`انزل ${route.label}`}
        title="انزل"
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)] disabled:opacity-40"
      >
        <RiArrowDownSLine className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onToggle('pinned')}
        aria-label={`${pinned ? 'ألغِ تثبيت' : 'ثبّت'} ${route.label}`}
        title={pinned ? 'ألغِ التثبيت' : 'ثبّت في الأعلى'}
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
      >
        <RiPushpinLine className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onToggle('hidden')}
        aria-label={`${hidden ? 'أظهر' : 'اخفِ'} ${route.label}`}
        title={hidden ? 'أظهرها' : 'اخفِها من القائمة'}
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
      >
        {hidden ? <RiEyeOffLine className="w-4 h-4" /> : <RiEyeLine className="w-4 h-4" />}
      </button>
    </li>
  );
}

/**
 * THE LOOK A NEW PERSON IN THIS ROLE OPENS ON.
 *
 * «بلا» writes NULL and not the default's key — «nobody chose» and «somebody
 * chose the default» are different facts the day the default moves, and the
 * door refuses to collapse them.
 */
function RoleOpeningTheme({ roleId }: { roleId: string }) {
  const [theme, setTheme] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  // The role changed under us — forget what the previous one was set to,
  // rather than showing it against the new name.
  useEffect(() => {
    setTheme('');
    setState('idle');
  }, [roleId]);

  const save = async (next: string) => {
    setTheme(next);
    setState('saving');
    try {
      await apiJson(`/api/roles/${roleId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="mt-3 border-t border-[var(--sys-border)] pt-2.5">
      <label className="block text-xs text-[var(--sys-muted-foreground)] mb-1">
        المظهر الذي يفتح عليه هذا الدور
      </label>
      <Select value={theme} onChange={(e) => void save(e.target.value)}>
        <option value="">بلا — الافتراضي</option>
        {THEME_CHOICES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.ar}
          </option>
        ))}
      </Select>
      <p className="mt-1.5 text-xs text-[var(--sys-muted-foreground)]">
        أساسٌ لا قيد: أوّلُ ما يختارُ الواحدُ مظهرَه، يُقرأُ اختيارُه هو ولا يُقرأُ هذا.
      </p>
      {state === 'saved' && <p className="mt-1 text-xs text-[var(--sys-success)]">انحفظ.</p>}
      {state === 'failed' && (
        <p className="mt-1 text-xs text-[var(--sys-destructive)]">تعذّر الحفظ — جرّب مرّة ثانية.</p>
      )}
    </div>
  );
}
