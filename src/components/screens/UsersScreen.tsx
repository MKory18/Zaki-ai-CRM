'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import { CreateUserModal } from './users/CreateUserModal';
import { useConfirm } from '@/components/ui/Confirm';
import { ASSIGNABLE_ROLES, ROLE_LABELS as ROLE_LABELS_AR, USER_STATUSES } from '@/types/auth';
import {
  Users,
  Search,
  ShieldCheck,
  KeyRound,
  ShieldOff,
  Ban,
  PlayCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';

/** One source for the Arabic role names — a screen with its own copy is how
 *  two of them ended up blank in the filter. */
const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_LABELS_AR).map(([key, label]) => [key, label.ar])
);

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  DISABLED: 'معطّل',
};

export function UsersScreen() {
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

  // Create + manage modals
  const [createOpen, setCreateOpen] = useState(false);
  const confirm = useConfirm();
  const [manageUser, setManageUser] = useState<any>(null);
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
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926] flex items-center space-x-2 rtl:space-x-reverse">
              <Users className="w-6 h-6 text-[#fb323f]" />
              <span>إدارة المستخدمين والأدوار</span>
            </h1>
            <p className="text-xs text-[#697586] mt-1">
              مراجعة طلبات التسجيل، تعيين الأدوار، تنشيط/إيقاف الحسابات — كل إجراء يُسجَّل في سجل التدقيق
            </p>
          </div>
          <div className="flex items-center gap-2">
            {userCan(currentUser, 'users.create') && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <UserPlus className="w-4 h-4" />
                موظف جديد
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => loadUsers(pagination.page)} className="p-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">{error}</div>
        )}

        {/* Filters */}
        <div className="bg-white border border-[#e3e8ef] rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="بحث بالاسم أو البريد الإلكتروني..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-[#f8fafc] border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]"
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
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
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
                <tbody className="divide-y divide-[#e3e8ef]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-[#121926]">{u.name}</p>
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
                      <td className="px-6 py-3.5 text-[#697586]">
                        {format(new Date(u.createdAt), 'yyyy-MM-dd')}
                      </td>
                      <td className="px-6 py-3.5 text-[#697586]">
                        {u.lastLoginAt ? format(new Date(u.lastLoginAt), 'yyyy-MM-dd HH:mm') : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-[#697586]">
                        {u.assignedBy?.name || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right rtl:text-left">
                        <div className="flex items-center gap-1.5 justify-end rtl:justify-start">
                          <Button size="sm" variant="outline" onClick={() => openManage(u)} className="text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                            إدارة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => (window.location.href = `/admin/users/${u.id}`)}
                            className="text-[11px]"
                            title="الدور والصلاحيات والوصول"
                          >
                            <KeyRound className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
                            صفحة الموظف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-[#e3e8ef] flex items-center justify-between text-xs text-[#697586]">
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

      <CreateUserModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async (created) => {
          await loadUsers(1);
          if (!created) return;
          // The role gives the defaults; anything particular to this person
          // is set in the permissions editor that already exists — offered
          // here rather than rebuilt inside the creation form.
          const open = await confirm({
            title: `أُنشئ حساب «${created.name}»`,
            body: 'صلاحياته الآن هي صلاحيات دوره. تخصيصها لهذا الموظف تحديداً؟',
            confirmLabel: 'خصّص صلاحياته',
            cancelLabel: 'لاحقاً',
          });
          if (open) window.location.href = `/admin/users/${created.id}`;
        }}
      />

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
              <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">{modalError}</div>
            )}

            {/* The role is changed in ONE place — the employee's page, where the
                permissions it carries and the stores it reaches are shown with
                it. A second editor here set the role's name and left its
                permissions on the old role. */}
            <a
              href={`/admin/users/${manageUser.id}`}
              className="flex items-center justify-between rounded-xl border border-[#e3e8ef] bg-[#f8fafc] p-3 text-xs font-semibold text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
            >
              <span>الدور الحالي: {ROLE_LABELS[manageUser.role] || manageUser.role}</span>
              <span>تغيير الدور والصلاحيات والوصول ←</span>
            </a>

            {/* Status actions */}
            <div className="border border-[#e3e8ef] rounded-xl p-4 space-y-3 bg-[#f8fafc]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">حالة الحساب</h4>
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
              <p className="text-[11px] text-[#697586]">
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
          <p className="text-sm text-[#364152] leading-relaxed">{pendingAction?.msg}</p>
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
                  ? 'bg-[#00c853] hover:bg-[#00c853]/85'
                  : 'bg-[#fb323f] hover:bg-[#fb323f]/85'
              }
            >
              تأكيد
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
