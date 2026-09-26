'use client';

import React from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/sign-out';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { ConfirmationCounter } from './ConfirmationCounter';
import { ShiftChip } from '@/components/attendance/ShiftChip';
import { ROLE_LABELS } from '@/types/auth';
import { RiLogoutBoxLine, RiMenuLine, RiRepeatLine, RiSearchLine, RiStore2Line } from '@remixicon/react';

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
  onSearchClick,
}: {
  onMenuClick: () => void;
  userName: string;
  userRole: string;
  context: ShellContextInfo;
  /** Opens the one box. The shortcut that also opens it lives in Shell. */
  onSearchClick: () => void;
}) {
  const logout = () => signOut('manual');

  return (
    <header className="sticky top-0 z-30 h-[72px] bg-[var(--sys-card)] border-b border-[var(--sys-border)] flex items-center gap-3 px-4 md:px-6">
      <button
        onClick={onMenuClick}
        className="md:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--sys-surface)]"
        aria-label="القائمة"
        title="القائمة"
      >
        <RiMenuLine className="w-5 h-5 text-[var(--sys-foreground)]" />
      </button>

      {/* Country + store context, always visible: every request carries it */}
      {/* `min-w-0 shrink` is what lets this give way on a phone. Without
          it the chip holds its full width, the header cannot fit, and the
          whole document grows 95px wider than the screen — so every page
          scrolls sideways into grey. The name already truncates; it just
          had no room in which to. */}
      <div className="flex min-w-0 shrink items-center gap-2 px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
        <RiStore2Line className="w-4 h-4 text-[var(--sys-primary)] shrink-0" />
        <div className="leading-tight min-w-0">
          <p className="text-xs font-semibold text-[var(--sys-heading)] truncate max-w-[160px]">{context.storeName}</p>
          <p className="text-xs text-[var(--sys-muted-foreground)] truncate">
            {context.countryName} · {context.currencyCode}
            {context.storePaused && <span className="text-[var(--sys-destructive)]"> · موقوف</span>}
          </p>
        </div>
        {/* On a desk there is room to offer the switch beside the name.
            On a phone there is not, and the same command is one tap away in
            the palette — which is also where signing out now lives. Seven
            controls in a 375px bar is how a bell gets missed and a logout
            gets hit. */}
        {context.canSwitch && (
          <Link
            href="/entry?change=1"
            className="mr-1 hidden md:block p-1.5 rounded-md text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-card)]"
            title="تبديل البلد أو المتجر"
          >
            <RiRepeatLine className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* ONE TRIGGER, NOT A SECOND SEARCH.
          What stood here was an input that searched orders and nothing
          else, that only the owner could see, and that sat beside a menu of
          fifty screens nobody could search at all. It is now the door to
          the palette — which finds records, screens AND actions, and which
          Ctrl/Cmd + K opens without reaching for the mouse.

          Everyone gets the door. What is behind it is still decided per
          person: record lookup remains the owner's, exactly as before. */}
      <button
        type="button"
        onClick={onSearchClick}
        className="hidden md:flex flex-1 max-w-md items-center gap-2 h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] text-sm text-[var(--sys-muted-foreground)] hover:border-[var(--sys-primary)]"
      >
        <RiSearchLine className="w-4 h-4 shrink-0 text-[var(--sys-muted)]" aria-hidden />
        <span className="flex-1 text-start truncate">ابحث، انتقل، أو نفّذ</span>
        <kbd className="shrink-0 rounded-sm border border-[var(--sys-border)] bg-[var(--sys-card)] px-1.5 py-0.5 text-xs font-sans text-[var(--sys-muted-foreground)]">
          Ctrl K
        </kbd>
      </button>

      {/* A phone has no Ctrl, so it gets the same door as an icon. */}
      <button
        type="button"
        onClick={onSearchClick}
        aria-label="ابحث، انتقل، أو نفّذ"
        className="md:hidden mr-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]"
        title="ابحث، انتقل، أو نفّذ"
      >
        <RiSearchLine className="w-5 h-5" />
      </button>

      {/*
        WRAPS INSTEAD OF PUSHING THE PAGE SIDEWAYS.
        Measured at 768 — the width where the sidebar appears and takes 280
        of it: this group is about 340px of shift chip, counter, bell and
        avatar, and `shrink-0` meant it would rather overflow the document by
        122px than give up a pixel. On a tablet a header that wraps to two
        rows is ordinary; a page that scrolls sideways is not.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-3 md:mr-auto lg:flex-nowrap">
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
          <p className="text-xs text-[var(--sys-muted-foreground)]">
            {ROLE_LABELS[userRole as keyof typeof ROLE_LABELS]?.ar ?? userRole}
          </p>
        </div>
        <button aria-label="تسجيل الخروج"
          onClick={logout}
          className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 hidden md:block p-2 rounded-lg text-[var(--sys-muted-foreground)] hover:text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]"
          title="تسجيل الخروج"
        >
          <RiLogoutBoxLine className="icon-mirror w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
