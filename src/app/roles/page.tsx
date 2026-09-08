'use client';

/**
 * SALESFLOW — /roles: informational role & permission matrix.
 * Backend RBAC (src/lib/rbac.ts) remains the source of truth.
 * This page never grants or revokes anything by itself.
 */

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { useApp } from '@/context/AppContext';
import {
  ROLE_PERMISSIONS, ROLE_LABELS, ALL_PERMISSIONS, PERMISSION_LABELS,
  type UserRole, type Permission,
} from '@/types/auth';
import { ShieldCheck, ChevronDown, ChevronUp, Users } from 'lucide-react';

const ROLE_DESCRIPTIONS: Record<UserRole, { ar: string; en: string }> = {
  SUPER_ADMIN: { ar: 'صلاحية كاملة على النظام وجميع الشركات — كل تجاوز يُسجّل إلزامياً', en: 'Full platform administration — every override is audit-logged' },
  COMPANY_ADMIN: { ar: 'إدارة كاملة داخل الشركة بدون إدارة حسابات المدراء الأعلى', en: 'Full company-scope administration' },
  MANAGER: { ar: 'إشراف تشغيلي واسع — لا صلاحية كتابة مالية', en: 'Broad operational oversight — no finance writes' },
  MODERATOR: { ar: 'إدخال الطلبات فقط — لا وصول للمال أو الإعدادات', en: 'Order intake only — no finance or settings' },
  CONFIRMATION_AGENT: { ar: 'تأكيد الطلبات المسندة إليه فقط', en: 'Confirm assigned orders only' },
  FOLLOW_UP_AGENT: { ar: 'متابعة الحالات المسندة إليه فقط', en: 'Handle assigned follow-up cases only' },
  SETTLEMENT_OFFICER: { ar: 'تسويات شركات الشحن — لا صلاحية على الصناديق', en: 'Shipping settlements — no cashbox access' },
  ACCOUNTANT: { ar: 'المال فقط — لا تعديل على حالات الطلبات التشغيلية', en: 'Money only — cannot change operational statuses' },
  DELIVERY_MANAGER: { ar: 'سير الشحن والتوصيل فقط', en: 'Shipping & delivery workflow only' },
  PENDING_USER: { ar: 'بانتظار موافقة المدير', en: 'Awaiting administrator approval' },
};

export default function RolesPage() {
  const { locale, isRtl } = useApp();
  const ar = locale === 'ar';
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const roles = Object.keys(ROLE_PERMISSIONS) as UserRole[];

  // Group permissions by their label group
  const groups = Array.from(new Set(Object.values(PERMISSION_LABELS).map((p) => p.group)));

  return (
    <AppLayout>
      <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#252f4a] flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#d13b4c]" />
            {ar ? 'الأدوار والصلاحيات' : 'Roles & Permissions'}
          </h1>
          <p className="text-xs text-[#6b7177] mt-1">
            {ar
              ? 'الصلاحيات مفروضة على الخادم في كل API — هذه المصفوفة للعرض والإدارة فقط.'
              : 'Permissions are enforced server-side on every API — this matrix is informational.'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {roles.map((role) => {
            const perms = ROLE_PERMISSIONS[role] || [];
            const isOpen = expanded[role];
            return (
              <Card key={role}>
                <CardContent className="p-0">
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [role]: !p[role] }))}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-start cursor-pointer hover:bg-[#f8f9fa]/70 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#252f4a]">{ar ? roleLabel(role).ar : roleLabel(role).en}</p>
                      <p className="text-[11px] text-[#9ca3af] mt-0.5">{role}</p>
                      <p className="text-[11px] text-[#6b7177] mt-1 leading-relaxed">
                        {ar ? ROLE_DESCRIPTIONS[role].ar : ROLE_DESCRIPTIONS[role].en}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold text-[#d13b4c] bg-[#fbe9ea] rounded-lg px-2 py-1">
                        {perms.length} {ar ? 'صلاحية' : 'perms'}
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-[#9ca3af]" /> : <ChevronDown className="w-4 h-4 text-[#9ca3af]" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 space-y-3">
                      {groups.map((g) => {
                        const gPerms = perms.filter((p) => (PERMISSION_LABELS as any)[p]?.group === g);
                        return (
                          <div key={g} className="rounded-xl border border-[#eef0f3] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b7177] mb-1.5">{g}</p>
                            {gPerms.length === 0 ? (
                              <p className="text-[11px] text-[#c3c8d4]">✗ {ar ? 'لا صلاحية' : 'no access'}</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {gPerms.map((p) => (
                                  <span key={p} className="text-[10px] font-medium text-[#25b865] bg-emerald-100 border-0 rounded-md px-1.5 py-0.5">
                                    ✓ {(PERMISSION_LABELS as any)[p]?.[ar ? 'ar' : 'en'] ?? p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}

function roleLabel(r: UserRole) {
  // Inline to avoid importing server-typed labels into extra bundles — same content as types/auth.ts
  const map: Record<UserRole, { ar: string; en: string }> = {
    SUPER_ADMIN: { ar: 'مدير النظام', en: 'Super Administrator' },
    COMPANY_ADMIN: { ar: 'مدير الشركة', en: 'Company Admin' },
    MANAGER: { ar: 'مدير', en: 'Manager' },
    MODERATOR: { ar: 'موديريتور', en: 'Moderator' },
    CONFIRMATION_AGENT: { ar: 'موظف التأكيد', en: 'Confirmation Agent' },
    FOLLOW_UP_AGENT: { ar: 'موظف المتابعة', en: 'Follow-Up Agent' },
    SETTLEMENT_OFFICER: { ar: 'مدقق التسويات', en: 'Settlement Officer' },
    ACCOUNTANT: { ar: 'المحاسب', en: 'Accountant' },
    DELIVERY_MANAGER: { ar: 'مدير التوصيل', en: 'Delivery Manager' },
    PENDING_USER: { ar: 'حساب معلق', en: 'Pending User' },
  };
  return map[r];
}
