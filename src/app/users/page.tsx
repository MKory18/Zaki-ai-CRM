'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { ASSIGNABLE_ROLES, USER_STATUSES } from '@/types/auth';
import {
  Users,
  Search,
  ShieldCheck,
  ShieldOff,
  Ban,
  PlayCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدير النظام',
  CONFIRMATION_AGENT: 'موظف التأكيد',
  FOLLOW_UP_AGENT: 'موظف المتابعة',
  SETTLEMENT_OFFICER: 'مدقق التسويات',
  COMPANY_ADMIN: 'مدير الشركة',
  MANAGER: 'مدير',
  MODERATOR: 'موديريتور',
  ACCOUNTANT: 'المحاسب',
  DELIVERY_MANAGER: 'مدير التوصيل',
  PENDING_USER: 'بانتظار التعيين',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  DISABLED: 'معطّل',
};

export default function UsersManagementPage() {
  const { currentUser } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Manage modal
  const [manageUser, setManageUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  // Critical-action confirmation (suspend/disable/role change)
  const [pendingAction, setPendingAction] = useState<{ action: string; extra?: any; title: string; msg: string } | null>(null);

  const loadUsers = useCallback(
    async (pageToLoad = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: pageToLoad.toString(),
          q: search,
          role: roleFilter,
          status: statusFilter,
          from: fromDate,
          to: toDate,
        });
        const res = await fetch(`/api/users?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUsers(data.users || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [search, roleFilter, statusFilter, fromDate, toDate]
  );

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(1), 250);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  const openManage = (u: any) => {
    setManageUser(u);
    setSelectedRole(u.role);
    setModalError(null);
    setPendingAction(null);
  };

  /** Critical actions require explicit confirmation (Decision 7 safety) */
  const requestAction = (action: string, title: string, msg: string, extra: any = {}) => {
    setPendingAction({ action, extra, title, msg });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    await handleAction(pendingAction.action, pendingAction.extra);
    setPendingAction(null);
  };

  const handleAction = async (action: string, extra: any = {}) => {
    if (!manageUser) return;
    setActionLoading(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/users/${manageUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setManageUser(null);
      loadUsers(pagination.page);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const statusVariant = (s: string) =>
    s === 'ACTIVE' ? 'success' : s === 'PENDING' ? 'warning' : 'danger';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a] flex items-center space-x-2 rtl:space-x-reverse">
              <Users className="w-6 h-6 text-[#d13b4c]" />
              <span>إدارة المستخدمين والأدوار</span>
            </h1>
            <p className="text-xs text-[#6b7177] mt-1">
              مراجعة طلبات التسجيل، تعيين الأدوار، تنشيط/إيقاف الحسابات — كل إجراء يُسجَّل في سجل التدقيق
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadUsers(pagination.page)} className="p-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-[#fbe9ea] border border-[#f5c6cb] text-[#d13b4c] text-xs rounded-lg">{error}</div>
        )}

        {/* Filters */}
        <div className="bg-white border border-[#eef0f3] rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="بحث بالاسم أو البريد الإلكتروني..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-[#f8f9fa] border border-[#eef0f3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3e97ff]/30 focus:border-[#3e97ff]"
            />
          </div>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-xs py-2">
            <option value="all">كل الأدوار</option>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]} ({r})
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs py-2">
            <option value="all">كل الحالات</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-xs py-1.5" />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-xs py-1.5" />
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8f9fa] border-b border-[#eef0f3] text-[#6b7177] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">المستخدم</th>
                    <th className="px-6 py-3.5">الدور الحالي</th>
                    <th className="px-6 py-3.5">حالة الحساب</th>
                    <th className="px-6 py-3.5">تاريخ التسجيل</th>
                    <th className="px-6 py-3.5">آخر دخول</th>
                    <th className="px-6 py-3.5">عيّنه</th>
                    <th className="px-6 py-3.5 text-right rtl:text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0f3]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#f8f9fa] transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-[#252f4a]">{u.name}</p>
                        <p className="text-[11px] text-[#9ca3af]">{u.email}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant={u.role === 'PENDING_USER' ? 'warning' : u.role === 'SUPER_ADMIN' ? 'purple' : 'info'}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant={statusVariant(u.status) as any}>{STATUS_LABELS[u.status] || u.status}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-[#6b7177]">
                        {format(new Date(u.createdAt), 'yyyy-MM-dd')}
                      </td>
                      <td className="px-6 py-3.5 text-[#6b7177]">
                        {u.lastLoginAt ? format(new Date(u.lastLoginAt), 'yyyy-MM-dd HH:mm') : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-[#6b7177]">
                        {u.assignedBy?.name || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right rtl:text-left">
                        <Button size="sm" variant="outline" onClick={() => openManage(u)} className="text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                          إدارة
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-[#eef0f3] flex items-center justify-between text-xs text-[#6b7177]">
              <span>
                إجمالي <strong>{pagination.total}</strong> مستخدم
              </span>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => loadUsers(pagination.page - 1)} className="p-1.5">
                  <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                </Button>
                <span className="font-medium">
                  صفحة {pagination.page} من {pagination.totalPages || 1}
                </span>
                <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => loadUsers(pagination.page + 1)} className="p-1.5">
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manage User Modal */}
      <Modal
        isOpen={!!manageUser}
        onClose={() => setManageUser(null)}
        title={`إدارة حساب: ${manageUser?.name || ''}`}
        subtitle={manageUser?.email}
      >
        {manageUser && (
          <div className="space-y-5">
            {modalError && (
              <div className="p-3 bg-[#fbe9ea] border border-[#f5c6cb] text-[#d13b4c] text-xs rounded-lg">{modalError}</div>
            )}

            {/* Assign role */}
            <div className="border border-[#eef0f3] rounded-xl p-4 space-y-3 bg-[#f8f9fa]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#4b5675]">تعيين / تغيير الدور</h4>
              <div className="flex items-end space-x-2 rtl:space-x-reverse">
                <Select
                  label="الدور الجديد"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="flex-1 text-xs"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} ({r})
                    </option>
                  ))}
                </Select>
                <Button
                  onClick={() =>
                    requestAction(
                      'assignRole',
                      'تغيير الرتبة؟',
                      'سيتم تسجيل تغيير الرتبة في سجل التدقيق وسيؤثر فوراً على صلاحيات هذا الموظف.',
                      { role: selectedRole }
                    )
                  }
                  loading={actionLoading}
                  disabled={selectedRole === manageUser.role}
                  className="bg-[#d13b4c] hover:bg-[#d13b4c]/85"
                >
                  <ShieldCheck className="w-4 h-4 ml-1 rtl:ml-0 rtl:mr-1" />
                  تعيين
                </Button>
              </div>
              {manageUser.role !== selectedRole && selectedRole !== 'PENDING_USER' && (
                <p className="text-[11px] text-[#c07f2a] bg-amber-50 border border-[#f4dcb8] rounded-lg p-2">
                  سيتم تسجيل تغيير الدور في سجل التدقيق: {ROLE_LABELS[manageUser.role]} → {ROLE_LABELS[selectedRole]}
                </p>
              )}
            </div>

            {/* Status actions */}
            <div className="border border-[#eef0f3] rounded-xl p-4 space-y-3 bg-[#f8f9fa]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#4b5675]">حالة الحساب</h4>
              <div className="flex flex-wrap gap-2">
                {manageUser.status === 'PENDING' && (
                  <Button size="sm" variant="success" loading={actionLoading} onClick={() => handleAction('changeStatus', { status: 'ACTIVE' })}>
                    <PlayCircle className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                    اعتماد الحساب
                  </Button>
                )}
                {manageUser.status !== 'ACTIVE' && manageUser.status !== 'PENDING' && (
                  <Button size="sm" variant="success" loading={actionLoading} onClick={() => handleAction('changeStatus', { status: 'ACTIVE' })}>
                    <PlayCircle className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                    تنشيط الحساب
                  </Button>
                )}
                {manageUser.status !== 'SUSPENDED' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading}
                    onClick={() =>
                      requestAction(
                        'changeStatus',
                        'إيقاف المستخدم؟',
                        'سيفقد هذا الموظف وصوله الفوري للموارد المحمية في النظام. سيتم إنهاء جميع جلساته النشطة.',
                        { status: 'SUSPENDED' }
                      )
                    }
                  >
                    <ShieldOff className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                    إيقاف مؤقت
                  </Button>
                )}
                {manageUser.status !== 'DISABLED' && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={actionLoading}
                    onClick={() =>
                      requestAction(
                        'changeStatus',
                        'تعطيل المستخدم؟',
                        'سيتم تعطيل الحساب نهائياً وإنهاء جميع جلساته فوراً.',
                        { status: 'DISABLED' }
                      )
                    }
                  >
                    <Ban className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                    تعطيل
                  </Button>
                )}
                <Button size="sm" variant="outline" loading={actionLoading} onClick={() => handleAction('forceLogout')}>
                  <LogOut className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                  إنهاء الجلسات (Force Logout)
                </Button>
              </div>
              <p className="text-[11px] text-[#6b7177]">
                إيقاف/تعطيل الحساب ينهي جميع الجلسات النشطة فوراً عبر إبطال التوكن الحالي.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Critical-action confirmation dialog */}
      <Modal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title={pendingAction?.title || ''}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#4b5675] leading-relaxed">{pendingAction?.msg}</p>
          {pendingAction?.action === 'assignRole' && (
            <div className="text-xs bg-amber-50 border border-[#f4dcb8] rounded-xl p-3 space-y-1">
              <p>
                <span className="text-[#6b7177]">الرتبة الحالية:</span>{' '}
                <span className="font-bold">{ROLE_LABELS[manageUser?.role] || manageUser?.role}</span>
              </p>
              <p>
                <span className="text-[#6b7177]">الرتبة الجديدة:</span>{' '}
                <span className="font-bold text-[#d13b4c]">{ROLE_LABELS[pendingAction.extra?.role] || pendingAction.extra?.role}</span>
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              loading={actionLoading}
              onClick={confirmPendingAction}
              className={
                pendingAction?.action === 'changeStatus' && pendingAction.extra?.status === 'ACTIVE'
                  ? 'bg-[#25b865] hover:bg-[#25b865]/85'
                  : 'bg-[#d13b4c] hover:bg-[#d13b4c]/85'
              }
            >
              تأكيد
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
