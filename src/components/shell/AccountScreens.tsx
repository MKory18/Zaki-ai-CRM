'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { signOut } from '@/lib/sign-out';
import { RiLockLine, RiLogoutBoxLine, RiMailCheckLine, RiRefreshLine, RiTimerLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';

/** Account-state screens for PENDING / SUSPENDED / DISABLED users. */

export function PendingScreen() {
  const { currentUser, refreshUser } = useApp();
  const [checking, setChecking] = useState(false);

  const handleLogout = () => signOut('manual');

  return (
    <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-[var(--sys-card)] rounded-lg shadow-raised p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-lg bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
          <RiTimerLine className="w-6 h-6 text-[var(--sys-destructive)]" />
        </div>

        <PageHeader title="الحساب بانتظار موافقة المدير"
          /* `description` is a STRING rendered as text (PageHeader.tsx), so the
             tags that were written into it were printed to the person
             verbatim — `<strong className=...>` and `<br />` shown on the
             screen of somebody who has just registered. */
          description={`تم إنشاء حسابك بنجاح (${currentUser?.email ?? ''}) وهو الآن بانتظار موافقة المدير. سيتم منحك صلاحيات الوصول بعد أن يقوم المدير بتعيين دور حسابك وتنشيطه.`}
        />

        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-4 text-xs text-[var(--sys-muted-foreground)] space-y-1">
          <p className="flex items-center justify-center space-x-2 rtl:space-x-reverse text-[var(--sys-heading)]">
            <RiMailCheckLine className="w-4 h-4 text-[var(--sys-warning)]" />
            <span>حالتك الحالية: قيد المراجعة (PENDING)</span>
          </p>
          <p>لن تتمكن من الوصول للطلبات أو العملاء أو المنتجات أو التقارير حتى يتم تنشيط حسابك.</p>
        </div>

        <div className="flex items-center justify-center space-x-3 rtl:space-x-reverse">
          <button
            onClick={async () => {
              setChecking(true);
              await refreshUser();
              setChecking(false);
              window.location.reload();
            }}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-card)] text-[var(--sys-heading)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-colors cursor-pointer"
          >
            <RiRefreshLine className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>تحديث الحالة</span>
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 transition-colors cursor-pointer"
          >
            <RiLogoutBoxLine className="icon-mirror w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AN ACTIVE ACCOUNT WITH NOTHING IT MAY OPEN.
 *
 * Not «pending» — the account works and has been approved — and not an
 * error: the manager simply has not given it a role that reaches a screen.
 * It says that, and offers the two things a person can do about it: ask,
 * and look again after they have asked.
 *
 * The card is PendingScreen's, class for class. The stylesheet is capped to
 * the byte, and a new screen that needed three new utilities would have
 * been refused by the build for a reason that has nothing to do with it.
 */
export function NoAccessScreen() {
  const { currentUser } = useApp();
  return (
    <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-[var(--sys-card)] rounded-lg shadow-raised p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-lg bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
          <RiLockLine className="w-6 h-6 text-[var(--sys-destructive)]" />
        </div>

        <PageHeader title="لا توجد شاشة متاحة لحسابك"
          description={`حسابك (${currentUser?.email ?? ''}) فعّال، لكنه لا يملك صلاحية فتح أي شاشة حالياً. اطلب من المدير أن يعيّن لحسابك دوراً، ثم اضغط «تحديث».`}
        />

        <div className="flex items-center justify-center space-x-3 rtl:space-x-reverse">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-card)] text-[var(--sys-heading)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-colors cursor-pointer"
          >
            <RiRefreshLine className="w-4 h-4" />
            <span>تحديث</span>
          </button>
          <button
            onClick={() => signOut('manual')}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 transition-colors cursor-pointer"
          >
            <RiLogoutBoxLine className="icon-mirror w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
}
