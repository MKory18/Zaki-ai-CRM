import Link from 'next/link';
import { Compass } from 'lucide-react';
import { SystemFrame } from './(system)/SystemFrame';

/** Anything outside the navigation contract resolves here. */
export default function NotFound() {
  return (
    <SystemFrame>
      <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-[var(--sys-card)] rounded-lg border border-[var(--sys-border)] p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
            <Compass className="w-7 h-7 text-[var(--sys-muted-foreground)]" />
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
