'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Clock, ShieldX, LogOut, RefreshCw, MailCheck } from 'lucide-react';
import { signOut } from '@/lib/sign-out';

/** Account-state screens for PENDING / SUSPENDED / DISABLED users. */

export function PendingScreen() {
  const { currentUser, refreshUser } = useApp();
  const [checking, setChecking] = useState(false);

  const handleLogout = () => signOut('manual');

  return (
    <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-[var(--sys-card)] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-lg bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
          <Clock className="w-8 h-8 text-[var(--sys-destructive)]" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-[var(--sys-heading)]">الحساب بانتظار موافقة المدير</h1>
          <p className="text-sm text-[var(--sys-foreground)] mt-3 leading-relaxed">
            تم إنشاء حسابك بنجاح <strong className="text-[var(--sys-destructive)]">{currentUser?.email}</strong>
            <br />
            وهو الآن بانتظار موافقة المدير. سيتم منحك صلاحيات الوصول بعد أن يقوم المدير
            بتعيين دور حسابك وتنشيطه.
          </p>
        </div>

        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-4 text-xs text-[var(--sys-muted-foreground)] space-y-1">
          <p className="flex items-center justify-center space-x-2 rtl:space-x-reverse text-[var(--sys-heading)]">
            <MailCheck className="w-4 h-4 text-[var(--sys-warning)]" />
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
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>تحديث الحالة</span>
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
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
      <div className="w-full max-w-lg bg-[var(--sys-card)] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-lg bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
          <ShieldX className="w-8 h-8 text-[var(--sys-destructive)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--sys-heading)]">
            {status === 'SUSPENDED' ? 'تم إيقاف حسابك مؤقتاً' : 'تم تعطيل حسابك'}
          </h1>
          <p className="text-sm text-[var(--sys-foreground)] mt-3">
            يرجى التواصل مع مدير النظام لاستعادة الوصول إلى حسابك.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}

