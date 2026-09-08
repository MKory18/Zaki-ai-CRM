'use client';

/**
 * SALESFLOW — /users/[id]: employee profile.
 * Identity + role/status + workload (assigned & claimed orders).
 * All data comes from the server; actions link back to the manage modal on /users.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { format } from 'date-fns';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  Clock,
  ArrowRight,
  ShoppingBag,
  UserCheck,
} from 'lucide-react';

export default function UserProfilePage() {
  const { locale, isRtl } = useApp();
  const ar = locale === 'ar';
  const params = useParams();
  const router = useRouter();
  const userId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : null;

  const [user, setUser] = useState<any>(null);
  const [workload, setWorkload] = useState<{ assigned: number; claimed: number; created: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        // Load user + workload counts via existing APIs (server enforces users.manage)
        const res = await fetch(`/api/users/${userId}/profile`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Not found');
        }
        const data = await res.json();
        setUser(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3e97ff]" />
        </div>
      </AppLayout>
    );
  }

  if (error || !user) {
    return (
      <AppLayout>
        <div className="space-y-4 text-center py-16" dir={isRtl ? 'rtl' : 'ltr'}>
          <p className="text-sm text-[#d13b4c]">{error || (ar ? 'المستخدم غير موجود' : 'User not found')}</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/users')}>
            {ar ? 'عودة للموظفين' : 'Back to Employees'}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const statusCls: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-[#25b865] border-[#bfe8d0]',
    PENDING: 'bg-amber-50 text-[#c07f2a] border-amber-300',
    SUSPENDED: 'bg-[#fbe9ea] text-[#d13b4c] border-[#f5c6cb]',
    DISABLED: 'bg-[#f3f4f6] text-[#6b7177] border-[#e2e5ec]',
  };

  return (
    <AppLayout>
      <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/users')}>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            {ar ? 'عودة للموظفين' : 'Back to Employees'}
          </Button>
        </div>

        {/* Identity header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#fbe9ea] border-2 border-[#f5c6cb] flex items-center justify-center shrink-0">
                <UserIcon className="w-7 h-7 text-[#d13b4c]" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-[#252f4a] truncate">{user.name}</h1>
                <p className="text-xs text-[#6b7177] flex items-center gap-1.5 mt-0.5" dir="ltr">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </p>
              </div>
              <span className={`text-[11px] font-bold rounded-full border-2 px-3 py-1 ${statusCls[user.status] || ''}`}>
                {user.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 text-xs">
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af] flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{ar ? 'الرتبة' : 'Role'}</p>
                <p className="font-bold text-[#252f4a]">{user.role}</p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af] flex items-center gap-1"><Clock className="w-3 h-3" />{ar ? 'آخر دخول' : 'Last Login'}</p>
                <p className="font-bold text-[#252f4a]">
                  {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm') : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af]">{ar ? 'تاريخ التسجيل' : 'Created'}</p>
                <p className="font-bold text-[#252f4a]">{format(new Date(user.createdAt), 'yyyy-MM-dd')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Workload */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#4b5675] mb-3">
              {ar ? 'حجم العمل الحالي' : 'Current Workload'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-[#eef0f3] px-3 py-4">
                <p className="text-2xl font-black text-[#d13b4c]">{user.workload?.assigned ?? 0}</p>
                <p className="text-[11px] text-[#6b7177] mt-1">{ar ? 'طلبات مسندة' : 'Assigned Orders'}</p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-4">
                <p className="text-2xl font-black text-[#252f4a]">{user.workload?.claimed ?? 0}</p>
                <p className="text-[11px] text-[#6b7177] mt-1">{ar ? 'طلبات مستلمة' : 'Claimed Orders'}</p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-4">
                <p className="text-2xl font-black text-[#252f4a]">{user.workload?.created ?? 0}</p>
                <p className="text-[11px] text-[#6b7177] mt-1">{ar ? 'طلبات منشأة' : 'Created Orders'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
