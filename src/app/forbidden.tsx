import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { SystemFrame } from './(system)/SystemFrame';

/** Rendered with a real 403 whenever a page guard calls forbidden(). */
export default function Forbidden() {
  return (
    <SystemFrame>
      <div className="min-h-screen bg-[var(--sys-surface)] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-[var(--sys-card)] rounded-[8px] border border-[var(--sys-border)] p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-[8px] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] flex items-center justify-center">
            <ShieldX className="w-7 h-7 text-[var(--sys-destructive)]" />
          </div>
          <h1 className="text-lg font-bold text-[var(--sys-heading)]">لا تملك صلاحية لهذه الشاشة</h1>
          <p className="text-sm text-[var(--sys-muted-foreground)]">
            هذه الشاشة خارج صلاحيات دورك. إذا كنت تحتاجها، اطلب من المدير إضافتها لدورك.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2 text-sm font-medium rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-primary)]/90"
          >
            العودة إلى شاشتك الأولى
          </Link>
        </div>
      </div>
    </SystemFrame>
  );
}
