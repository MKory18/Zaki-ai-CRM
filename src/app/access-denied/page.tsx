'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white">الوصول مرفوض</h1>
          <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
            ليس لديك صلاحية الوصول إلى هذه الصفحة.
            <br />
            تواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center space-x-2 rtl:space-x-reverse px-5 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للوحة التحكم</span>
        </Link>
      </div>
    </div>
  );
}
