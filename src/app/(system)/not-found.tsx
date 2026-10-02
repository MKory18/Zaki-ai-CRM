import Link from 'next/link';
import { SystemFrame } from './SystemFrame';
import { RiCompass3Line } from '@remixicon/react';

/**
 * A SCREEN OF THE SYSTEM THAT DOES NOT EXIST.
 *
 * This is the dashboard's own 404, and it sits here rather than at the
 * root because the root one is rendered into the tree of EVERY route —
 * including a shopper's. While this component was the root's, Next linked
 * the dashboard's font stylesheet into every storefront page and React
 * preloaded its nine faces: 218 KB at the highest priority a browser has,
 * on pages that apply none of it. Measured in a production build.
 *
 * Here it reaches only addresses under the system's layout, where the
 * faces are wanted and already loaded.
 */
export default function NotFound() {
  return (
    <SystemFrame>
      <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-[var(--sys-card)] rounded-lg border border-[var(--sys-border)] p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
            <RiCompass3Line className="w-6 h-6 text-[var(--sys-muted-foreground)]" />
          </div>
          <h1 className="text-lg font-bold text-[var(--sys-heading)]">الصفحة غير موجودة</h1>
          <p className="text-sm text-[var(--sys-muted-foreground)]">الرابط الذي فتحته ليس ضمن شاشات النظام.</p>
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
