'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#feecee] border border-[#fecdd1] flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-[#ffab00]" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-[#121926]">الوصول مرفوض</h1>
          <p className="text-sm text-[#364152] mt-3 leading-relaxed">
            ليس لديك صلاحية الوصول إلى هذه الصفحة.
            <br />
            تواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2.5 text-sm font-medium rounded bg-[#b8256e] text-white hover:bg-[#b8256e]/85 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للوحة التحكم</span>
        </Link>
      </div>
    </div>
  );
}
