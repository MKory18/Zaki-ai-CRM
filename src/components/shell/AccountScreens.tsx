'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { signOut } from '@/lib/sign-out';
import { RiLogoutBoxLine, RiMailCheckLine, RiRefreshLine, RiShieldCrossLine, RiTimerLine } from '@remixicon/react';
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
          description={`تم إنشاء حسابك بنجاح <strong className="text-[var(--sys-destructive)]">${currentUser?.email}</strong> <br /> وهو الآن بانتظار موافقة المدير. سيتم منحك صلاحيات الوصول بعد أن يقوم المدير بتعيين دور حسابك وتنشيطه.`}
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

export function BlockedScreen({ status }: { status: string }) {
  const handleLogout = () => signOut('manual');

  return (
    <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-[var(--sys-card)] rounded-lg shadow-raised p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-lg bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
          <RiShieldCrossLine className="w-6 h-6 text-[var(--sys-destructive)]" />
        </div>
        <PageHeader title={status === 'SUSPENDED' ? 'تم إيقاف حسابك مؤقتاً' : 'تم تعطيل حسابك'}
          description="يرجى التواصل مع مدير النظام لاستعادة الوصول إلى حسابك."
        />
        <button
          onClick={handleLogout}
          className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 transition-colors cursor-pointer"
        >
          <RiLogoutBoxLine className="icon-mirror w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}

