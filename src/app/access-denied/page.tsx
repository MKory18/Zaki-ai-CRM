'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#fbeeef] border border-[#f4d7da] flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-[#e49e3d]" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-[#252f4a]">الوصول مرفوض</h1>
          <p className="text-sm text-[#4b5675] mt-3 leading-relaxed">
            ليس لديك صلاحية الوصول إلى هذه الصفحة.
            <br />
            تواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2.5 text-sm font-medium rounded bg-[#3e97ff] text-white hover:bg-[#3e97ff]/85 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للوحة التحكم</span>
        </Link>
      </div>
    </div>
  );
}
