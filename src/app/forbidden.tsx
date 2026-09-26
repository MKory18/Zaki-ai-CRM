import Link from 'next/link';
import { SystemFrame } from './(system)/SystemFrame';
import { RiShieldCrossLine } from '@remixicon/react';

/** Rendered with a real 403 whenever a page guard calls forbidden(). */
export default function Forbidden() {
  return (
    <SystemFrame>
      <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-[var(--sys-card)] rounded-lg border border-[var(--sys-border)] p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-lg bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
            <RiShieldCrossLine className="w-6 h-6 text-[var(--sys-destructive)]" />
          </div>
          <h1 className="text-lg font-bold text-[var(--sys-heading)]">لا تملك صلاحية لهذه الشاشة</h1>
          <p className="text-sm text-[var(--sys-muted-foreground)]">
            هذه الشاشة خارج صلاحيات دورك. إذا كنت تحتاجها، اطلب من المدير إضافتها لدورك.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2 text-sm font-medium rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-primary)]/90"
          >
            العودة إلى شاشتك الأولى
          </Link>
        </div>
      </div>
    </SystemFrame>
  );
}
