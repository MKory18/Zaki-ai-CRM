import Link from 'next/link';
import { Compass } from 'lucide-react';

/** Anything outside the navigation contract resolves here. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-[8px] border border-[#e3e8ef] p-8 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
          <Compass className="w-7 h-7 text-[#697586]" />
        </div>
        <h1 className="text-lg font-bold text-[#121926]">الصفحة غير موجودة</h1>
        <p className="text-sm text-[#697586]">الرابط الذي فتحته ليس ضمن شاشات النظام.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2 text-sm font-medium rounded-[8px] bg-[#b8256e] text-white hover:bg-[#b8256e]/90"
        >
          العودة إلى شاشتك الأولى
        </Link>
      </div>
    </div>
  );
}
