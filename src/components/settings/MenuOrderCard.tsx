'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { THEME_CHOICES } from '@/lib/system-themes';
import { Select } from '@/components/ui/Input';
import { NAV } from '@/lib/route-registry';
import { applyArrangement, EMPTY_LAYOUT, type NavLayout } from '@/lib/nav-arrangement';
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
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
 * ── UP AND DOWN, NOT DRAG ──
 *
 * The design shows drag handles. Buttons ship the control today and a
 * dragged list does not: a drag needs pointer, touch and keyboard paths to
 * be equal, and on a 390 px screen — which this product is held to — a
 * drag inside a scrolling column fights the scroll. Two buttons work with
 * a thumb, with a keyboard and with a screen reader on the first day.
 * Dragging is recorded (RV46) as the nicer surface over the same stored
 * shape, which is the part that is hard to change later.
 *
 * ── AND ARRANGING OPENS NOTHING ──
 *
 * The list below is the viewer's OWN menu, as the server built it. Hiding
 * removes a row from a list; the door is still checked when it is opened,
 * and a hidden screen reached by its URL is refused exactly as before.
 */
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
    const to = at + by;
    // Inside its own group only: a screen does not change what it is about
    // by being dragged under another heading.
    if (to < 0 || to >= within.length) return;
    [within[at], within[to]] = [within[to], within[at]];
    const next = flat.filter((p) => !within.includes(p));
    // Rebuilt as «everything else, with this group's new order spliced in
    // where the group sits», so one group's move never reshuffles another.
    const head = flat.slice(0, flat.indexOf(group.routes[0].path)).filter((p) => !within.includes(p));
    setLayout({ ...layout, order: [...head, ...within, ...next.slice(head.length)] });
  }

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
    <div dir="rtl" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black text-[var(--sys-foreground)]">ترتيب القائمة</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            رتّب قائمتك: حرّك، ثبّت، أو اخفِ ما لا تستعمله. الإخفاء لا يفتح ولا يغلق أي صلاحية.
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

      {ordered.map((group) => (
        <Card key={group.key}>
          <CardHeader title={group.label} />
          <CardContent>
            <ul className="divide-y divide-[var(--sys-border)]">
              {group.routes.map((route, i) => (
                <li key={route.path} className="flex items-center gap-2 py-2">
                  <span
                    className={
                      isHidden(route.path)
                        ? 'flex-1 text-sm text-[var(--sys-muted)] line-through'
                        : 'flex-1 text-sm text-[var(--sys-heading)]'
                    }
                  >
                    {route.label}
                    {isPinned(route.path) && (
                      <span className="text-xs text-[var(--sys-primary)]"> · مثبّت</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(route.path, -1)}
                    disabled={i === 0}
                    aria-label={`ارفع ${route.label}`}
                    title="ارفع"
                    className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)] disabled:opacity-40"
                  >
                    <RiArrowUpSLine className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(route.path, 1)}
                    disabled={i === group.routes.length - 1}
                    aria-label={`انزل ${route.label}`}
                    title="انزل"
                    className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)] disabled:opacity-40"
                  >
                    <RiArrowDownSLine className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle('pinned', route.path)}
                    aria-label={`${isPinned(route.path) ? 'ألغِ تثبيت' : 'ثبّت'} ${route.label}`}
                    title={isPinned(route.path) ? 'ألغِ التثبيت' : 'ثبّت في الأعلى'}
                    className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
                  >
                    <RiPushpinLine className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle('hidden', route.path)}
                    aria-label={`${isHidden(route.path) ? 'أظهر' : 'اخفِ'} ${route.label}`}
                    title={isHidden(route.path) ? 'أظهرها' : 'اخفِها من القائمة'}
                    className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
                  >
                    {isHidden(route.path) ? (
                      <RiEyeOffLine className="w-4 h-4" />
                    ) : (
                      <RiEyeLine className="w-4 h-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
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
