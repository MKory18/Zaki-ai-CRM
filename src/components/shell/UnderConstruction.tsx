import React from 'react';
import { Hammer } from 'lucide-react';
import type { RouteDef } from '@/lib/route-registry';

/**
 * Placeholder for a contract screen whose stage has not shipped yet. The
 * route exists and is permission-guarded; only its content is pending.
 */
export function UnderConstruction({ route }: { route: RouteDef }) {
  return (
    <div className="max-w-xl mx-auto mt-16 text-center bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-10">
      <div className="mx-auto w-14 h-14 rounded-[8px] bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
        <Hammer className="w-7 h-7 text-[var(--sys-primary)]" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-[var(--sys-heading)]">{route.label}</h1>
      <p className="mt-2 text-sm text-[var(--sys-muted-foreground)] leading-relaxed">
        هذه الشاشة ضمن خطة البناء وتصل في المرحلة {route.stage}.
        <br />
        المسار والصلاحيات جاهزة، والمحتوى قيد التنفيذ.
      </p>
      <p className="mt-4 text-xs text-[var(--sys-muted)]" dir="ltr">
        {route.path}
      </p>
    </div>
  );
}
