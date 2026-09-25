'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, Repeat, Search, Store } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { signOut } from '@/lib/sign-out';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { ConfirmationCounter } from './ConfirmationCounter';
import { ShiftChip } from '@/components/attendance/ShiftChip';
import { ROLE_LABELS } from '@/types/auth';

export interface ShellContextInfo {
  storeName: string;
  storePaused: boolean;
  countryName: string;
  currencyCode: string;
  canSwitch: boolean;
}

export function Header({
  onMenuClick,
  userName,
  userRole,
  context,
}: {
  onMenuClick: () => void;
  userName: string;
  userRole: string;
  context: ShellContextInfo;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  /** The owner's search. Everyone else works from their own queue. */
  const canSearch = userRole === 'SUPER_ADMIN';

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) router.push(`/orders?q=${encodeURIComponent(query.trim())}`);
  };

  const logout = () => signOut('manual');

  return (
    <header className="sticky top-0 z-30 h-[72px] bg-[var(--sys-card)] border-b border-[var(--sys-border)] flex items-center gap-3 px-4 md:px-6">
      <button onClick={onMenuClick} className="md:hidden p-2 rounded-lg hover:bg-[var(--sys-surface)]" aria-label="القائمة">
        <Menu className="w-5 h-5 text-[var(--sys-foreground)]" />
      </button>

      {/* Country + store context, always visible: every request carries it */}
      {/* `min-w-0 shrink` is what lets this give way on a phone. Without
          it the chip holds its full width, the header cannot fit, and the
          whole document grows 95px wider than the screen — so every page
          scrolls sideways into grey. The name already truncates; it just
          had no room in which to. */}
      <div className="flex min-w-0 shrink items-center gap-2 px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
        <Store className="w-4 h-4 text-[var(--sys-primary)] shrink-0" />
        <div className="leading-tight min-w-0">
          <p className="text-xs font-semibold text-[var(--sys-heading)] truncate max-w-[160px]">{context.storeName}</p>
          <p className="text-[10px] text-[var(--sys-muted-foreground)] truncate">
            {context.countryName} · {context.currencyCode}
            {context.storePaused && <span className="text-[var(--sys-destructive)]"> · موقوف</span>}
          </p>
        </div>
        {context.canSwitch && (
          <Link
            href="/entry?change=1"
            className="mr-1 p-1.5 rounded-md text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-card)]"
            title="تبديل البلد أو المتجر"
          >
            <Repeat className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Searching the whole store by phone or customer name is the owner's
          tool, not the floor's. The RESULTS were always scoped — the orders
          service filters by role, so an agent typing the URL by hand still
          only ever sees her own — but a box inviting everyone to look up any
          customer is not the same thing as a box only the owner has. */}
      {canSearch && (
      <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-md items-center relative">
        <Search className="w-4 h-4 text-[var(--sys-muted)] absolute right-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برقم الطلب أو اسم العميل أو الهاتف"
          className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] text-sm focus:outline-none focus:border-[var(--sys-primary)]"
        />
      </form>
      )}

      <div className="flex shrink-0 items-center gap-3 mr-auto">
        {/* Am I on shift, and how long since my last order. It lives here
            rather than above a queue: same place on every screen, beside
            the name, and never in the path of somebody clicking fast. The
            server decides who sees it — the owner does not clock in. */}
        <ShiftChip />

        {/* How much confirmation work is waiting — the pool for whoever
            pulls from it, and a moderator's own unconfirmed orders for him.
            A number only; the server decides which, or none. */}
        <ConfirmationCounter />

        {/* Work is announced here: this person's own notifications for the
            selected store. The server decides who is told what. */}
        <NotificationBell />

        <div className="text-left leading-tight hidden sm:block">
          <p className="text-xs font-semibold text-[var(--sys-heading)]">{userName}</p>
          <p className="text-[10px] text-[var(--sys-muted-foreground)]">
            {ROLE_LABELS[userRole as keyof typeof ROLE_LABELS]?.ar ?? userRole}
          </p>
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-lg text-[var(--sys-muted-foreground)] hover:text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]"
          title="تسجيل الخروج"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
