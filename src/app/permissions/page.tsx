'use client';

/**
 * SALESFLOW — /permissions: role أ— permission matrix grouped by category.
 * Informational only — the backend RBAC engine is the enforcement point.
 */

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { useApp } from '@/context/AppContext';
import { ROLE_PERMISSIONS, ROLE_LABELS, PERMISSION_LABELS, ALL_PERMISSIONS, type Permission, type UserRole } from '@/types/auth';
import { Lock } from 'lucide-react';

const GROUPS: { key: string; ar: string; en: string }[] = [
  { key: 'USERS', ar: 'المستخدمون', en: 'Users' },
  { key: 'ORDERS', ar: 'الطلبات', en: 'Orders' },
  { key: 'CUSTOMERS', ar: 'العملاء', en: 'Customers' },
  { key: 'PRODUCTS', ar: 'المنتجات والعروض', en: 'Products & Offers' },
  { key: 'FINANCE', ar: 'المالية', en: 'Finance' },
  { key: 'SETTLEMENT', ar: 'التسويات', en: 'Settlement' },
  { key: 'OPERATIONS', ar: 'المخزون والإنتاج', en: 'Inventory & Production' },
  { key: 'ANALYTICS', ar: 'التحليلات والتقارير', en: 'Analytics & Reports' },
  { key: 'SETTINGS', ar: 'الإعدادات والتدقيق', en: 'Settings & Audit' },
];

const ROLES: UserRole[] = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'MODERATOR',
  'CONFIRMATION_AGENT', 'FOLLOW_UP_AGENT', 'SETTLEMENT_OFFICER',
  'ACCOUNTANT', 'DELIVERY_MANAGER', 'PENDING_USER',
];

export default function PermissionsPage() {
  const { locale, isRtl } = useApp();
  const ar = locale === 'ar';

  const rolePerms = (r: UserRole): Permission[] => ROLE_PERMISSIONS[r] ?? [];

  return (
    <AppLayout>
      <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#121926] flex items-center gap-2">
            <Lock className="w-6 h-6 text-[#fb323f]" />
            {ar ? 'مصفوفة الصلاحيات' : 'Permissions Matrix'}
          </h1>
          <p className="text-xs text-[#697586] mt-1">
            {ar
              ? 'كل صلاحية تُفحص على الخادم قبل أي عملية حساسة — العرض هنا توثيقي فقط.'
              : 'Every sensitive operation re-checks permissions server-side. This view is documentation.'}
          </p>
        </div>

        {GROUPS.map((g) => {
          const gPerms = (Object.keys(PERMISSION_LABELS) as Permission[]).filter((p) => (PERMISSION_LABELS as any)[p].group === g.key);
          if (gPerms.length === 0) return null;
          return (
            <Card key={g.key}>
              <CardContent className="p-0">
                <div className="px-5 py-3.5 border-b border-[#e3e8ef] bg-[#f8fafc]/60">
                  <h3 className="text-sm font-bold text-[#121926]">{ar ? g.ar : g.en}</h3>
                </div>
                <div className="divide-y divide-[#f8fafc]">
                  {gPerms.map((perm) => {
                    const label = (PERMISSION_LABELS as any)[perm];
                    return (
                      <div key={perm} className="px-5 py-2.5 flex flex-wrap items-center gap-y-2 gap-x-3 text-xs">
                        <div className="min-w-[180px] sm:min-w-[240px]">
                          <p className="font-semibold text-[#364152]">{ar ? label.ar : label.en}</p>
                          <p className="text-[10px] text-[#9ca3af] font-mono">{perm}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {ROLES.map((r) => {
                            const has = rolePerms(r).includes(perm) || r === 'SUPER_ADMIN';
                            return (
                              <span
                                key={r}
                                title={`${ROLE_LABELS[r]}: ${has ? '✓' : '✗'}`}
                                className={`text-[10px] font-medium rounded-md px-1.5 py-0.5 border ${
                                  has
                                    ? 'text-[#00c853] bg-emerald-100 border-0'
                                    : 'text-[#c3c8d4] bg-[#f8fafc] border-[#e3e8ef]'
                                }`}
                              >
                                {has ? '✓' : '✗'} {roleShort(r, ar)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}

function roleShort(r: UserRole, ar: boolean): string {
  const short: Partial<Record<UserRole, string>> = {
    SUPER_ADMIN: ar ? 'الأعلى' : 'S.ADMIN',
    COMPANY_ADMIN: ar ? 'مدير شركة' : 'C.ADMIN',
    MANAGER: ar ? 'مدير' : 'MGR',
    MODERATOR: ar ? 'موديريتور' : 'MOD',
    CONFIRMATION_AGENT: ar ? 'تأكيد' : 'CONF',
    FOLLOW_UP_AGENT: ar ? 'متابعة' : 'FOLLOW',
    SETTLEMENT_OFFICER: ar ? 'تسويات' : 'STL',
    ACCOUNTANT: ar ? 'محاسب' : 'ACC',
    DELIVERY_MANAGER: ar ? 'توصيل' : 'DLV',
    PENDING_USER: ar ? 'معلق' : 'PEND',
  };
  return short[r] ?? r;
}
