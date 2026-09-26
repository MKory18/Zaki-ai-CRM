'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RiArrowRightSLine,
  RiCloseLine,
  RiLoader4Line,
  RiSearchLine,
} from '@remixicon/react';
import type { NavGroup } from '@/lib/route-registry';
import { iconFor } from './icons';
import { RAIL_EVENT, railed as storedRail, setRailed } from '@/lib/sidebar-rail';
import { signOut } from '@/lib/sign-out';

/**
 * ONE BOX FOR EVERYTHING.
 *
 * The global search was a box in the header that only a SUPER_ADMIN could
 * see, that searched orders and nothing else, and that lived beside a menu
 * of fifty screens nobody could search at all. Somebody looking for
 * "الإغلاق اليومي" opened four groups to find it; somebody holding a parcel
 * typed its barcode into a screen that could not match one.
 *
 * So: one box. Type an order number, a phone or a barcode and the record
 * comes back. Type a screen's name and it is there. And the handful of
 * commands that are not screens at all — switching store, signing out,
 * folding the menu — are here too, because they live in the chrome and had
 * no other way in but the mouse.
 *
 * AN ACTION IS NEVER A SCREEN UNDER A VERB.
 *
 * The first version of this list read «شحنة جديدة», «إغلاق اليوم»,
 * «استلام مرتجع» — and every one of the six was already a route in the
 * menu, with a noun for a name. That is not a third group; it is the second
 * group again, in a second vocabulary, maintained by hand and free to drift
 * from the permissions the real routes carry. So an action here must be
 * something the registry does NOT name, and `palette-actions.test.ts`
 * refuses any that is.
 *
 * ROLE-AWARE BY CONSTRUCTION, NOT BY FILTERING.
 *
 * The screens come from `visibleNav`, which the SERVER already narrowed to
 * what this account may open. The records come from `/api/orders`, which
 * demands `orders.view` and filters by role again — a palette cannot show
 * an order the person could not have found anyway. The actions are gated on
 * the same permission keys their screens are.
 *
 * That matters more than it sounds: a palette built by listing everything
 * and hiding what the user lacks is a palette that leaks the shape of the
 * system to whoever reads the bundle.
 *
 * AND ONE DECISION IS DELIBERATELY NOT MINE TO CHANGE.
 *
 * The header's search box was the owner's alone, for a stated reason: the
 * RESULTS were always scoped, but a box inviting everyone to look up any
 * customer by phone is not the same thing as a box only the owner has. That
 * is a privacy rule, not a layout one. So `canSearchRecords` carries it
 * across unchanged: everybody gets the screens and the actions — navigating
 * to a screen you already hold is not an exposure — and record lookup stays
 * exactly where it was.
 */

interface Action {
  key: string;
  label: (folded: boolean) => string;
  hint: string;
  icon: string;
  /** Where it goes, when it goes anywhere the registry does not already name. */
  href?: string;
  /** Some commands only exist for some people; `true` when it always does. */
  offered?: (ctx: { canSwitchStore: boolean }) => boolean;
  /** Does its glyph point somewhere, and so turn in a right-to-left page? */
  mirror?: boolean;
  /** Or what it does, when it does not go anywhere at all. */
  run?: () => void;
}

/** The commands that live in the chrome, and so have no route to be found at. */
const ACTIONS: Action[] = [
  {
    key: 'switch',
    label: () => 'تبديل المتجر أو البلد',
    hint: 'كل طلب يحمل البلد والمتجر المختارَين',
    icon: 'Repeat',
    href: '/entry?change=1',
    // Exactly the header's own condition: one store and one country means
    // a picker with one thing in it.
    offered: ({ canSwitchStore }) => canSwitchStore,
  },
  {
    key: 'rail',
    label: (folded) => (folded ? 'وسّع القائمة' : 'اطوِ القائمة إلى شريط'),
    hint: 'أعرض للشاشة، أضيق للقائمة — ويُحفظ على هذا المتصفح',
    icon: 'SideBar',
    // The glyph shows a panel against one edge, so it turns with the page.
    mirror: true,
    run: () => setRailed(!storedRail()),
  },
  {
    key: 'signout',
    label: () => 'تسجيل الخروج',
    hint: 'أنهِ الجلسة على هذا الجهاز',
    icon: 'SignOut',
    run: () => signOut('manual'),
  },
];

interface Hit {
  id: string;
  orderNumber: string;
  customer?: { fullName?: string | null } | null;
  totalAmount?: number | string | null;
  currency?: string | null;
}

/** Same shape for all three, so a row is a row and the list reads as one. */
interface Row {
  kind: 'record' | 'screen' | 'action';
  key: string;
  label: string;
  hint: string;
  icon: string;
  mirror?: boolean;
  /** Choosing it navigates, or does something here. Never both. */
  href?: string;
  run?: () => void;
}

const GROUP_AR: Record<Row['kind'], string> = {
  record: 'سجلات',
  screen: 'شاشات',
  action: 'أفعال',
};

/** Long enough that typing a barcode is one request, not eleven. */
const SETTLE_MS = 220;

export function CommandPalette({
  groups,
  canSearchRecords,
  canSwitchStore,
  open,
  onClose,
}: {
  groups: NavGroup[];
  /** The header's existing rule, moved not rewritten. See the note above. */
  canSearchRecords: boolean;
  /** Likewise the header's: is there more than one store or country? */
  canSwitchStore: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  /** Only so one command can read its own name aloud both ways round. */
  const [folded, setFolded] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHits(null);
    setCursor(0);
    // After paint, or the focus lands on an element that is still hidden.
    setFolded(storedRail());
    const id = setTimeout(() => box.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    const heard = () => setFolded(storedRail());
    window.addEventListener(RAIL_EVENT, heard);
    return () => window.removeEventListener(RAIL_EVENT, heard);
  }, []);

  /**
   * The records. A scanned barcode and a typed order number take the same
   * path — the one the orders screen uses — so the palette can never find
   * something the screen behind it could not.
   */
  useEffect(() => {
    const term = query.trim();
    if (!open || !canSearchRecords || term.length < 2) {
      setHits(null);
      return;
    }
    let dropped = false;
    setLooking(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders?q=${encodeURIComponent(term)}&limit=6`, {
          credentials: 'same-origin',
        });
        const data = res.ok ? await res.json() : { orders: [] };
        if (!dropped) setHits(data.orders ?? []);
      } catch {
        if (!dropped) setHits([]);
      } finally {
        if (!dropped) setLooking(false);
      }
    }, SETTLE_MS);
    return () => {
      dropped = true;
      clearTimeout(id);
    };
  }, [query, open, canSearchRecords]);

  /**
   * WHAT AN OPEN, EMPTY BOX SHOULD SAY.
   *
   * Not "here are the first twenty-four of your fifty screens". That is the
   * menu again in a smaller window, and it answers a question nobody asked.
   * So an empty box offers the three commands that have no route to be
   * found at; typing is what asks for a screen or a record.
   *
   * And each group is capped on its own, never the list as a whole — a
   * common order number must not be able to push the commands out of reach.
   */
  const rows: Row[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const asRow = (a: Action): Row => ({
      kind: 'action',
      key: `a:${a.key}`,
      label: a.label(folded),
      hint: a.hint,
      icon: a.icon,
      mirror: a.mirror,
      href: a.href,
      run: a.run,
    });

    const offered = ACTIONS.filter((a) => !a.offered || a.offered({ canSwitchStore }));

    if (!term) return offered.map(asRow);

    const records: Row[] = (hits ?? []).slice(0, 6).map((hit) => ({
      kind: 'record',
      key: `r:${hit.id}`,
      label: hit.orderNumber,
      hint: hit.customer?.fullName ?? 'طلب',
      href: `/orders?q=${encodeURIComponent(hit.orderNumber)}`,
      icon: 'Receipt',
    }));

    const screens: Row[] = groups
      .flatMap((group) => group.routes.map((route) => ({ group, route })))
      .filter(({ route }) => route.label.toLowerCase().includes(term) || route.path.includes(term))
      .slice(0, 8)
      .map(({ group, route }) => ({
        kind: 'screen' as const,
        key: `s:${route.path}`,
        label: route.label,
        hint: group.label,
        href: route.path,
        icon: route.icon,
      }));

    const actions: Row[] = offered.map(asRow).filter((r) => r.label.toLowerCase().includes(term));

    return [...records, ...screens, ...actions];
  }, [groups, hits, query, folded, canSwitchStore]);

  const go = useCallback(
    (row: Row) => {
      onClose();
      if (row.href) router.push(row.href);
      else row.run?.();
    },
    [onClose, router]
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const row = rows[cursor];
        if (row) go(row);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [rows, cursor, go, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--sys-background)]/70 backdrop-blur-sm md:p-4 md:pt-[10vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="بحث وتنقّل وأفعال"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden border-[var(--sys-border)] bg-[var(--sys-card)] shadow-overlay md:h-auto md:max-h-[70vh] md:max-w-xl md:rounded-lg md:border"
      >
        <div className="flex items-center gap-2 border-b border-[var(--sys-border)] px-4">
          <RiSearchLine className="w-5 h-5 shrink-0 text-[var(--sys-muted)]" aria-hidden />
          <input
            ref={box}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKey}
            placeholder={
              canSearchRecords ? 'رقم طلب، هاتف، باركود، اسم شاشة، أو فعل…' : 'اسم شاشة، أو ما تريد فعله…'
            }
            aria-label="ابحث أو انتقل أو نفّذ"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--sys-muted)]"
          />
          {looking && <RiLoader4Line className="w-4 h-4 shrink-0 animate-spin text-[var(--sys-muted)]" aria-hidden />}
          {/* A full-screen sheet covers the backdrop, and a phone has no
              Esc. Without this there is no way back out. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="md:hidden -mr-1 p-2 text-[var(--sys-muted-foreground)]"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-[var(--sys-muted-foreground)]">
              {query.trim().length < 2
                ? canSearchRecords
                  ? 'اكتب حرفين على الأقل — أو امسح باركوداً.'
                  : 'اكتب حرفين على الأقل.'
                : 'لا شيء بهذا الاسم ولا بهذا الرقم، ضمن ما تملك صلاحية رؤيته.'}
            </li>
          )}

          {rows.map((row, i) => {
            // Derived, not accumulated: a heading appears where the kind
            // changes. A running variable mutated mid-render happens to
            // work and is the kind of thing that stops working.
            const head = i === 0 || rows[i - 1].kind !== row.kind ? GROUP_AR[row.kind] : null;
            const Icon = iconFor(row.icon);
            return (
              <React.Fragment key={row.key}>
                {head && (
                  <li className="px-4 pb-1 pt-3 text-xs font-semibold text-[var(--sys-muted-foreground)]">{head}</li>
                )}
                <li>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(row)}
                    aria-current={i === cursor ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-start ${
                      i === cursor ? 'bg-[var(--sys-primary-soft)]' : ''
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 text-[var(--sys-muted-foreground)] ${
                        row.mirror ? 'icon-mirror' : ''
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--sys-heading)]">{row.label}</span>
                      <span className="block truncate text-xs text-[var(--sys-muted-foreground)]">{row.hint}</span>
                    </span>
                    {/* A chevron promises a destination; a command that
                        acts right here has none. */}
                    {row.href ? (
                      <RiArrowRightSLine className="icon-mirror w-4 h-4 shrink-0 text-[var(--sys-muted)]" aria-hidden />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                  </button>
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        {/* Esc and Enter are a desk's vocabulary. On a phone the ✕ above is
            the whole instruction, and a line naming keys that are not there
            is one more thing to read and ignore. */}
        <p className="hidden md:block border-t border-[var(--sys-border)] px-4 py-2 text-xs text-[var(--sys-muted-foreground)]">
          ↑ ↓ للتنقّل · Enter للفتح · Esc للإغلاق
        </p>
      </div>
    </div>
  );
}

/** Ctrl/Cmd + K, from anywhere, without every screen knowing about it. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen };
}
