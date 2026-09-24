import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { SystemFrame } from './(system)/SystemFrame';

/** Rendered with a real 403 whenever a page guard calls forbidden(). */
export default function Forbidden() {
  return (
    <SystemFrame>
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-[8px] border border-[#e3e8ef] p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-[8px] bg-[#feecee] border border-[#fecdd1] flex items-center justify-center">
            <ShieldX className="w-7 h-7 text-[#fb323f]" />
          </div>
          <h1 className="text-lg font-bold text-[#121926]">لا تملك صلاحية لهذه الشاشة</h1>
          <p className="text-sm text-[#697586]">
            هذه الشاشة خارج صلاحيات دورك. إذا كنت تحتاجها، اطلب من المدير إضافتها لدورك.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2 text-sm font-medium rounded-[8px] bg-[#b8256e] text-white hover:bg-[#b8256e]/90"
          >
            العودة إلى شاشتك الأولى
          </Link>
        </div>
      </div>
    </SystemFrame>
  );
}
