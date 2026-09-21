import React from 'react';
import { Hammer } from 'lucide-react';
import type { RouteDef } from '@/lib/route-registry';

/**
 * Placeholder for a contract screen whose stage has not shipped yet. The
 * route exists and is permission-guarded; only its content is pending.
 */
export function UnderConstruction({ route }: { route: RouteDef }) {
  return (
    <div className="max-w-xl mx-auto mt-16 text-center bg-white border border-[#e3e8ef] rounded-[8px] p-10">
      <div className="mx-auto w-14 h-14 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
        <Hammer className="w-7 h-7 text-[#b8256e]" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-[#121926]">{route.label}</h1>
      <p className="mt-2 text-sm text-[#697586] leading-relaxed">
        هذه الشاشة ضمن خطة البناء وتصل في المرحلة {route.stage}.
        <br />
        المسار والصلاحيات جاهزة، والمحتوى قيد التنفيذ.
      </p>
      <p className="mt-4 text-xs text-[#9aa4b2]" dir="ltr">
        {route.path}
      </p>
    </div>
  );
}
