'use client';

/**
 * SALESFLOW — /users/[id]: employee profile.
 * Identity + role/status + workload (assigned & claimed orders).
 * All data comes from the server; actions link back to the manage modal on /users.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import {
  PERMISSION_MODULES,
  MODULE_LABELS,
  SCOPE_LABELS,
  catalogItem,
  type ScopeValue,
} from '@/lib/permission-catalog';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { format } from 'date-fns';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  Clock,
  ArrowRight,
  ShoppingBag,
  UserCheck,
  KeyRound,
  Plus,
  Trash2,
  Search,
  X,
} from 'lucide-react';

export default function UserProfilePage() {
  const { locale, isRtl, currentUser } = useApp();
  const ar = locale === 'ar';
  const params = useParams();
  const router = useRouter();
  const userId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : null;

  const [user, setUser] = useState<any>(null);
  const [workload, setWorkload] = useState<{ assigned: number; claimed: number; created: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Role assignment state (roleId-based)
  const [roles, setRoles] = useState<{ id: string; name: string; isSystem: boolean; permissionsCount: number }[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [roleFlash, setRoleFlash] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const canAssignRole = userCan(currentUser, 'users.edit');

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        // Load user + workload counts via existing APIs (server enforces users.view)
        const res = await fetch(`/api/users/${userId}/profile`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Not found');
        }
        const data = await res.json();
        setUser(data);
        // Load assignable roles (system + company) — server enforces roles.view
        // via the same API used by /roles; failure is non-fatal here.
        try {
          const rolesRes = await fetch('/api/roles');
          if (rolesRes.ok) {
            const rolesData = await rolesRes.json();
            setRoles(
              (rolesData.roles ?? []).map((r: any) => ({
                id: r.id,
                name: r.name,
                isSystem: r.isSystem,
                permissionsCount: r.permissionsCount,
              }))
            );
          }
        } catch {
          // role picker stays empty; assignment card falls back to display-only
        }
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#b8256e]" />
        </div>
      </AppLayout>
    );
  }

  if (error || !user) {
    return (
      <AppLayout>
        <div className="space-y-4 text-center py-16" dir={isRtl ? 'rtl' : 'ltr'}>
          <p className="text-sm text-[#fb323f]">{error || (ar ? 'المستخدم غير موجود' : 'User not found')}</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/users')}>
            {ar ? 'عودة للموظفين' : 'Back to Employees'}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const statusCls: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-[#00c853] border-[#bfe8d0]',
    PENDING: 'bg-amber-50 text-[#c07f2a] border-amber-300',
    SUSPENDED: 'bg-[#feecee] text-[#fb323f] border-[#f5c6cb]',
    DISABLED: 'bg-[#f8fafc] text-[#697586] border-[#e2e5ec]',
  };

  const currentRoleRow = roles.find((r) => r.name === user.role);
  const effectivePermsCount = currentRoleRow?.permissionsCount ?? null;

  async function saveRole() {
    if (!selectedRoleId || !user) return;
    setSavingRole(true);
    setRoleError(null);
    setRoleFlash(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignRole', roleId: selectedRoleId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || (ar ? 'فشل حفظ الدور' : 'Failed to update role'));
      }
      const d = await res.json();
      setUser((prev: any) => ({ ...prev, role: d.user?.role ?? prev.role }));
      setRoleFlash(ar ? 'تم تحديث الدور بنجاح' : 'Role updated successfully');
      setTimeout(() => setRoleFlash(null), 2500);
    } catch (e: any) {
      setRoleError(e.message);
    } finally {
      setSavingRole(false);
    }
  }

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
              <div className="w-14 h-14 rounded-2xl bg-[#feecee] border-2 border-[#f5c6cb] flex items-center justify-center shrink-0">
                <UserIcon className="w-7 h-7 text-[#fb323f]" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-[#121926] truncate">{user.name}</h1>
                <p className="text-xs text-[#697586] flex items-center gap-1.5 mt-0.5" dir="ltr">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </p>
              </div>
              <span className={`text-[11px] font-bold rounded-full border-2 px-3 py-1 ${statusCls[user.status] || ''}`}>
                {user.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 text-xs">
              <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af] flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{ar ? 'الرتبة' : 'Role'}</p>
                <p className="font-bold text-[#121926]">{user.role}</p>
              </div>
              <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af] flex items-center gap-1"><Clock className="w-3 h-3" />{ar ? 'آخر دخول' : 'Last Login'}</p>
                <p className="font-bold text-[#121926]">
                  {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm') : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af]">{ar ? 'تاريخ التسجيل' : 'Created'}</p>
                <p className="font-bold text-[#121926]">{format(new Date(user.createdAt), 'yyyy-MM-dd')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role assignment (roleId-based) */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#364152] mb-3 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              {ar ? 'الدور والصلاحيات' : 'Role & Permissions'}
            </h3>
            {roleFlash && (
              <div className="mb-3 rounded-lg bg-[#e6f9ee] border border-[#c8f2d8] text-[#00c853] text-xs font-medium px-3 py-2">
                {roleFlash}
              </div>
            )}
            {roleError && (
              <div className="mb-3 rounded-lg bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs font-medium px-3 py-2">
                {roleError}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <p className="text-[10px] text-[#9ca3af]">{ar ? 'الدور الحالي' : 'Current role'}</p>
                <p className="text-sm font-bold text-[#121926]">{user.role}</p>
                {effectivePermsCount !== null && (
                  <p className="text-[11px] text-[#697586]">
                    {ar ? `${effectivePermsCount} صلاحية فعّالة` : `${effectivePermsCount} effective permissions`}
                  </p>
                )}
              </div>
              {canAssignRole && roles.length > 0 && (
                <>
                  <div className="flex-1 max-w-xs">
                    <Select
                      label={ar ? 'تغيير الدور' : 'Change role'}
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      options={[
                        { value: '', label: ar ? '— اختر دورًا —' : '— Pick a role —' },
                        ...roles.map((r) => ({
                          value: r.id,
                          label: `${r.name}${r.isSystem ? (ar ? ' (نظامي)' : ' (system)') : ''}`,
                        })),
                      ]}
                    />
                  </div>
                  <Button onClick={saveRole} loading={savingRole} disabled={!selectedRoleId}>
                    {ar ? 'حفظ الدور' : 'Save role'}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Effective permissions + user overrides (Phase 5) — gated server-side by users.view/users.edit */}
        {userCan(currentUser, 'users.view') && userId && (
          <UserPermissionsSection userId={userId} canEdit={userCan(currentUser, 'users.edit')} />
        )}

        {/* Workload */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#364152] mb-3">
              {ar ? 'حجم العمل الحالي' : 'Current Workload'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-[#e3e8ef] px-3 py-4">
                <p className="text-2xl font-black text-[#fb323f]">{user.workload?.assigned ?? 0}</p>
                <p className="text-[11px] text-[#697586] mt-1">{ar ? 'طلبات مسندة' : 'Assigned Orders'}</p>
              </div>
              <div className="rounded-xl bg-[#f8fafc] px-3 py-4">
                <p className="text-2xl font-black text-[#121926]">{user.workload?.claimed ?? 0}</p>
                <p className="text-[11px] text-[#697586] mt-1">{ar ? 'طلبات مستلمة' : 'Claimed Orders'}</p>
              </div>
              <div className="rounded-xl bg-[#f8fafc] px-3 py-4">
                <p className="text-2xl font-black text-[#121926]">{user.workload?.created ?? 0}</p>
                <p className="text-[11px] text-[#697586] mt-1">{ar ? 'طلبات منشأة' : 'Created Orders'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// ─── Phase 5: Effective permissions inspector + user override editor ───
// Server remains the source of truth: /api/users/:id/permissions (GET/PUT)
// and /api/users/:id/permissions/:permission (DELETE) enforce users.view /
// users.edit plus tenant and SUPER_ADMIN guards. This UI only gates affordances.

interface GrantLike {
  scope: string;
  scopeIds?: unknown[] | null;
}

interface PermsPayload {
  user: { id: string; name: string; email: string };
  role: { id: string | null; name: string };
  permissionsVersion: number;
  roleGrants: Record<string, GrantLike>;
  overrides: { permission: string; effect: string; scope: string | null; scopeIds: unknown[] | null }[];
  effective: { fullAccess: boolean; grants: Record<string, GrantLike> };
  denied: string[];
}

interface EffectiveRow {
  key: string;
  ar: string;
  en: string;
  roleEffect: 'ALLOW' | null; // role_permissions carry no DENY effect
  overrideEffect: 'ALLOW' | 'DENY' | null;
  effectiveEffect: 'ALLOW' | 'DENY' | null;
  scopeLabel: string | null;
}

const PRODUCT_SEARCH_DEBOUNCE_MS = 350;

function UserPermissionsSection({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { locale } = useApp();
  const ar = locale === 'ar';

  const [payload, setPayload] = useState<PermsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  // Add/edit-override modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [draftEffect, setDraftEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [draftScope, setDraftScope] = useState<ScopeValue>('ALL_COMPANY');
  // Advanced toggle: scopes stay hidden unless the admin opts in
  const [advancedScopes, setAdvancedScopes] = useState(false);
  const [draftScopeIds, setDraftScopeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Scope pickers (mirrors the /roles editor)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPerms = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/users/${userId}/permissions`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || (ar ? 'فشل تحميل الصلاحيات' : 'Failed to load permissions'));
      }
      const data: PermsPayload = await res.json();
      setPayload(data);
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, [userId, ar]);

  useEffect(() => {
    loadPerms();
  }, [loadPerms]);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  const overridesMap = useMemo(
    () => new Map((payload?.overrides ?? []).map((o) => [o.permission, o])),
    [payload]
  );
  const isFullAccess = payload?.effective.fullAccess ?? false;

  // ── Effective-permission table rows: roleGrants ∪ overrides ∪ effective ──
  const rows = useMemo<EffectiveRow[]>(() => {
    if (!payload) return [];
    const keys = new Set<string>([
      ...Object.keys(payload.roleGrants),
      ...payload.overrides.map((o) => o.permission),
      ...(payload.effective.fullAccess ? [] : Object.keys(payload.effective.grants)),
    ]);
    // Sort by catalog order (module → item) for a predictable layout
    const order = new Map<string, number>();
    PERMISSION_MODULES.forEach((m, mi) => m.items.forEach((i, ii) => order.set(i.key, mi * 1000 + ii)));
    return [...keys].sort((a, b) => (order.get(a) ?? 999999) - (order.get(b) ?? 999999)).map((key) => {
      const item = catalogItem(key);
      const ov = overridesMap.get(key);
      const eff = payload.effective.fullAccess ? { scope: 'ALL_COMPANY' } : payload.effective.grants[key];
      const effScope = (eff?.scope as ScopeValue | undefined) ?? null;
      return {
        key,
        ar: item?.ar ?? key,
        en: item?.en ?? key,
        roleEffect: payload.roleGrants[key] ? 'ALLOW' : null,
        overrideEffect: ov ? (ov.effect === 'DENY' ? 'DENY' : 'ALLOW') : null,
        effectiveEffect: payload.effective.fullAccess || eff ? 'ALLOW' : 'DENY',
        scopeLabel: effScope ? (SCOPE_LABELS[effScope]?.[ar ? 'ar' : 'en'] ?? effScope) : null,
      };
    });
  }, [payload, overridesMap, ar]);

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.key.toLowerCase().includes(q) || r.ar.includes(tableSearch.trim()) || r.en.toLowerCase().includes(q)
    );
  }, [rows, tableSearch]);

  // ── Modal helpers ──
  function openAddModal() {
    setDraftKey('');
    setDraftEffect('ALLOW');
    setDraftScope('ALL_COMPANY');
    setDraftScopeIds([]);
    setModalError(null);
    setProductQuery('');
    setProductResults([]);
    setProductsError(null);
    setModalOpen(true);
  }

  function onDraftKeyChange(key: string) {
    setDraftKey(key);
    setModalError(null);
    const existing = overridesMap.get(key);
    if (existing) {
      // Permission already has an override → prefill (edit-in-place semantics)
      setDraftEffect(existing.effect === 'DENY' ? 'DENY' : 'ALLOW');
      const declared: readonly string[] = catalogItem(key)?.scopes ?? ['ALL_COMPANY'];
      const s = (existing.scope as ScopeValue) ?? 'ALL_COMPANY';
      setDraftScope(declared.includes(s) ? s : 'ALL_COMPANY');
      setDraftScopeIds(Array.isArray(existing.scopeIds) ? (existing.scopeIds as string[]) : []);
      setProductQuery('');
      setProductResults([]);
    } else {
      setDraftEffect('ALLOW');
      setDraftScope('ALL_COMPANY');
      setDraftScopeIds([]);
      setProductQuery('');
      setProductResults([]);
    }
  }

  function onDraftScopeChange(s: ScopeValue) {
    setDraftScope(s);
    setDraftScopeIds([]);
    setModalError(null);
  }

  function toggleScopeId(id: string) {
    setDraftScopeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Load categories once when a CATEGORY scope is being picked
  useEffect(() => {
    if (!modalOpen || draftEffect !== 'ALLOW' || draftScope !== 'CATEGORY' || categories.length > 0 || categoriesError) return;
    fetch('/api/categories')
      .then(async (r) => {
        if (!r.ok) throw new Error('failed');
        return r.json();
      })
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategoriesError(ar ? 'تعذر تحميل الفئات' : 'Failed to load categories'));
  }, [modalOpen, draftEffect, draftScope, categories.length, categoriesError, ar]);

  // Debounced product search for SPECIFIC scope
  useEffect(() => {
    if (!modalOpen || draftEffect !== 'ALLOW' || draftScope !== 'SPECIFIC') return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setProductLoading(true);
      setProductsError(null);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(productQuery)}&limit=20`);
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        setProductResults(
          (data.products ?? []).map((p: any) => ({ id: p.id, name: p.name, sku: p.sku }))
        );
      } catch {
        setProductsError(ar ? 'تعذر البحث في المنتجات' : 'Product search failed');
      } finally {
        setProductLoading(false);
      }
    }, PRODUCT_SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [productQuery, modalOpen, draftEffect, draftScope, ar]);

  async function saveOverride() {
    if (!payload) return;
    if (!draftKey) {
      setModalError(ar ? 'اختر صلاحية أولًا' : 'Pick a permission first');
      return;
    }
    if (draftEffect === 'ALLOW' && (draftScope === 'CATEGORY' || draftScope === 'SPECIFIC') && draftScopeIds.length === 0) {
      setModalError(
        draftScope === 'CATEGORY'
          ? (ar ? 'اختر فئة واحدة على الأقل' : 'Pick at least one category')
          : (ar ? 'اختر منتجًا واحدًا على الأقل' : 'Pick at least one product')
      );
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const isScoped = draftEffect === 'ALLOW' && (draftScope === 'CATEGORY' || draftScope === 'SPECIFIC');
      // Full replacement payload: keep every other override verbatim + this one
      const overrides = [
        ...payload.overrides
          .filter((o) => o.permission !== draftKey)
          .map((o) => ({
            permission: o.permission,
            effect: o.effect,
            ...(o.effect === 'ALLOW' && o.scope ? { scope: o.scope } : {}),
            ...(Array.isArray(o.scopeIds) && o.scopeIds.length > 0 ? { scopeIds: o.scopeIds as string[] } : {}),
          })),
        {
          permission: draftKey,
          effect: draftEffect,
          ...(draftEffect === 'ALLOW' ? { scope: draftScope } : {}),
          ...(isScoped ? { scopeIds: draftScopeIds } : {}),
        },
      ];
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || (ar ? 'فشل حفظ الاستثناءات' : 'Failed to save overrides'));
      }
      setModalOpen(false);
      showFlash(ar ? 'تم حفظ الاستثناءات بنجاح' : 'Overrides saved successfully');
      await loadPerms();
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(permission: string) {
    setRemoving(permission);
    try {
      const res = await fetch(`/api/users/${userId}/permissions/${encodeURIComponent(permission)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || (ar ? 'فشل إزالة الاستثناء' : 'Failed to remove override'));
      }
      showFlash(ar ? 'تم إزالة الاستثناء' : 'Override removed');
      await loadPerms();
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setRemoving(null);
    }
  }

  const effectiveCount = payload ? Object.keys(payload.effective.grants).length : 0;
  const overrideCount = payload?.overrides.length ?? 0;
  const draftIsEdit = overridesMap.has(draftKey);

  return (
    <>
      {/* Card 1 — Effective permissions */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-xs font-black uppercase tracking-wide text-[#364152] mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            {ar ? 'الصلاحيات الفعّالة' : 'Effective Permissions'}
          </h3>

          {loadError && (
            <div className="rounded-lg bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs font-medium px-3 py-2 mb-3 flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={loadPerms}>
                {ar ? 'إعادة المحاولة' : 'Retry'}
              </Button>
            </div>
          )}

          {!payload && !loadError && (
            <p className="text-xs text-[#9ca3af] py-3">{ar ? 'جارِ التحميل…' : 'Loading…'}</p>
          )}

          {payload && (
            <>
              {/* Summary line */}
              <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5 text-xs text-[#364152] mb-3 flex flex-wrap gap-x-3 gap-y-1">
                <span className="font-bold text-[#121926]">
                  {ar ? `الدور: ${payload.role.name}` : `Role: ${payload.role.name}`}
                </span>
                <span>
                  •{' '}
                  {isFullAccess
                    ? (ar ? 'وصول كامل (كل الصلاحيات)' : 'Full access (all permissions)')
                    : (ar ? `${effectiveCount} صلاحية فعّالة` : `${effectiveCount} effective permissions`)}
                </span>
                <span>• {ar ? `${overrideCount} استثناء` : `${overrideCount} overrides`}</span>
              </div>

              {isFullAccess ? (
                <p className="text-xs text-[#697586]">
                  {ar
                    ? 'حساب SUPER_ADMIN — وصول كامل مركزيًا ولا يقبل استثناءات.'
                    : 'SUPER_ADMIN account — central full access; overrides do not apply.'}
                </p>
              ) : (
                <>
                  <div className="relative max-w-xs mb-3">
                    <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[#9aa4b2]" />
                    <Input
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder={ar ? 'بحث في الصلاحيات…' : 'Search permissions…'}
                      className="ps-8 text-xs"
                    />
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-[#e3e8ef]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#f8fafc] text-[#364152]">
                          <th className="text-start font-bold px-3 py-2">{ar ? 'الصلاحية' : 'Permission'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'من الدور' : 'Role'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'الاستثناء' : 'Override'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'الفعّالة' : 'Effective'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'النطاق' : 'Scope'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f8fafc]">
                        {filteredRows.map((r) => (
                          <tr key={r.key} className="hover:bg-[#f8fafc]/60">
                            <td className="px-3 py-2 min-w-[160px]">
                              <p className="font-medium text-[#121926]">{ar ? r.ar : r.en}</p>
                              <p className="text-[10px] text-[#9ca3af] font-mono" dir="ltr">{r.key}</p>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.roleEffect ? (
                                <span className="font-bold text-[#00c853]">ALLOW آ· {ar ? 'موروث' : 'inherited'}</span>
                              ) : (
                                <span className="text-[#9ca3af]">{ar ? 'غير ممنوح' : 'not granted'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.overrideEffect ? (
                                <span className={`font-bold ${r.overrideEffect === 'DENY' ? 'text-[#fb323f]' : 'text-[#00c853]'}`}>
                                  {r.overrideEffect} آ· {r.overrideEffect === 'DENY' ? (ar ? 'منع' : 'deny') : (ar ? 'إضافة' : 'allow')}
                                </span>
                              ) : (
                                <span className="text-[#9ca3af]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.effectiveEffect === 'ALLOW' ? (
                                <span className="font-bold text-[#00c853]">ALLOW</span>
                              ) : (
                                <span className="font-bold text-[#fb323f]">
                                  DENY <span className="font-medium">آ· {ar ? 'ممنوع' : 'denied'}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#697586] whitespace-nowrap">{r.scopeLabel ?? '—'}</td>
                          </tr>
                        ))}
                        {filteredRows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-[#9ca3af]">
                              {ar ? 'لا نتائج مطابقة للبحث' : 'No matching permissions'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Card 2 — User overrides */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#364152] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              {ar ? 'استثناءات المستخدم' : 'User Overrides'}
            </h3>
            {canEdit && !isFullAccess && (
              <Button size="sm" onClick={openAddModal}>
                <Plus className="w-3.5 h-3.5" />
                {ar ? 'إضافة استثناء' : 'Add override'}
              </Button>
            )}
          </div>

          {flash && (
            <div className="mb-3 rounded-lg bg-[#e6f9ee] border border-[#c8f2d8] text-[#00c853] text-xs font-medium px-3 py-2">
              {flash}
            </div>
          )}

          {payload && isFullAccess && (
            <p className="text-xs text-[#697586]">
              {ar ? 'لا توجد استثناءات — حساب SUPER_ADMIN وصول كامل.' : 'No overrides — SUPER_ADMIN has central full access.'}
            </p>
          )}

          {payload && !isFullAccess && (
            payload.overrides.length === 0 ? (
              <p className="text-xs text-[#697586]">
                {ar
                  ? 'لا توجد استثناءات — الصلاحيات تأتي من الدور كما هي.'
                  : 'No overrides — permissions come from the role as-is.'}
              </p>
            ) : (
              <ul className="divide-y divide-[#f8fafc] rounded-xl border border-[#e3e8ef]">
                {payload.overrides.map((o) => {
                  const item = catalogItem(o.permission);
                  const scopeLabel = o.scope
                    ? (SCOPE_LABELS[o.scope as ScopeValue]?.[ar ? 'ar' : 'en'] ?? o.scope)
                    : null;
                  return (
                    <li key={o.permission} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#121926] truncate">
                          {ar ? item?.ar ?? o.permission : item?.en ?? o.permission}
                        </p>
                        <p className="text-[10px] text-[#9ca3af] font-mono" dir="ltr">{o.permission}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold rounded-[8px] px-2 py-0.5 border ${
                            o.effect === 'DENY'
                              ? 'text-[#fb323f] bg-[#feecee] border-[#fecdd1]'
                              : 'text-[#00c853] bg-[#e6f9ee] border-[#c8f2d8]'
                          }`}
                        >
                          {o.effect === 'DENY' ? `DENY آ· ${ar ? 'منع' : 'deny'}` : `ALLOW آ· ${ar ? 'إضافة' : 'allow'}`}
                        </span>
                        {o.effect === 'ALLOW' && scopeLabel && (
                          <span className="text-[10px] text-[#697586]">{scopeLabel}</span>
                        )}
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[#fb323f]"
                            loading={removing === o.permission}
                            onClick={() => removeOverride(o.permission)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {ar ? 'إزالة' : 'Remove'}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </CardContent>
      </Card>

      {/* Add/edit override modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={draftIsEdit ? (ar ? 'تعديل استثناء قائم' : 'Edit existing override') : (ar ? 'إضافة استثناء' : 'Add Override')}
        subtitle={ar ? 'الاستثناء يخص هذا المستخدم فقط ويتجاوز صلاحيات الدور' : 'Overrides apply to this user only, on top of the role'}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {/* Permission picker — grouped by module from the catalog */}
          <Select
            label={ar ? 'الصلاحية' : 'Permission'}
            value={draftKey}
            onChange={(e) => onDraftKeyChange(e.target.value)}
          >
            <option value="">{ar ? '— اختر صلاحية —' : '— Pick a permission —'}</option>
            {PERMISSION_MODULES.map((m) => (
              <optgroup key={m.module} label={ar ? MODULE_LABELS[m.module]?.ar ?? m.module : MODULE_LABELS[m.module]?.en ?? m.module}>
                {m.items.map((i) => (
                  <option key={i.key} value={i.key}>
                    {ar ? i.ar : i.en}
                    {overridesMap.has(i.key) ? (ar ? ' (لديه استثناء)' : ' (has override)') : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          {/* Effect radio — text labels, never color alone */}
          <div>
            <p className="block text-xs font-medium text-[#121926] mb-1.5">{ar ? 'نوع الاستثناء' : 'Effect'}</p>
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-1.5 text-xs text-[#121926] cursor-pointer">
                <input
                  type="radio"
                  name="override-effect"
                  checked={draftEffect === 'ALLOW'}
                  onChange={() => setDraftEffect('ALLOW')}
                  className="w-3.5 h-3.5 accent-[#00c853] cursor-pointer"
                />
                ALLOW آ· {ar ? 'منح (يتجاوز الدور)' : 'grant'}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[#121926] cursor-pointer">
                <input
                  type="radio"
                  name="override-effect"
                  checked={draftEffect === 'DENY'}
                  onChange={() => setDraftEffect('DENY')}
                  className="w-3.5 h-3.5 accent-[#fb323f] cursor-pointer"
                />
                DENY آ· {ar ? 'منع (يحجب حتى لو سمح الدور)' : 'deny'}
              </label>
              {/* Advanced toggle — scopes stay hidden for ordinary permission changes */}
              <label className="flex items-center gap-1.5 text-xs text-[#697586] cursor-pointer ms-auto">
                <input
                  type="checkbox"
                  checked={advancedScopes}
                  onChange={(e) => {
                    setAdvancedScopes(e.target.checked);
                    if (!e.target.checked) onDraftScopeChange('ALL_COMPANY');
                  }}
                  className="w-3.5 h-3.5 accent-[#b8256e] cursor-pointer"
                />
                {ar ? 'تخصيص نطاق الوصول' : 'Customize access scope'}
              </label>
            </div>
          </div>

          {/* Scope — only meaningful for ALLOW (DENY blocks regardless of scope);
              hidden behind the advanced toggle for ordinary permission changes */}
          {draftEffect === 'ALLOW' && advancedScopes && (
            <>
              <Select
                label={ar ? 'النطاق' : 'Scope'}
                value={draftScope}
                onChange={(e) => onDraftScopeChange(e.target.value as ScopeValue)}
                options={(catalogItem(draftKey)?.scopes ?? ['ALL_COMPANY']).map((s) => ({
                  value: s,
                  label: ar ? SCOPE_LABELS[s].ar : SCOPE_LABELS[s].en,
                }))}
              />

              {draftKey && draftScope === 'CATEGORY' && (
                <div className="rounded-lg bg-[#f8fafc] border border-[#e3e8ef] p-3">
                  {categoriesError && <p className="text-[11px] text-[#fb323f]">{categoriesError}</p>}
                  {!categoriesError && categories.length === 0 && (
                    <p className="text-[11px] text-[#9ca3af]">{ar ? 'لا توجد فئات بعد' : 'No categories yet'}</p>
                  )}
                  {categories.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {categories.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-[11px] text-[#121926] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draftScopeIds.includes(c.id)}
                            onChange={() => toggleScopeId(c.id)}
                            className="w-3.5 h-3.5 accent-[#b8256e] cursor-pointer"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {draftKey && draftScope === 'SPECIFIC' && (
                <div className="rounded-lg bg-[#f8fafc] border border-[#e3e8ef] p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[#9aa4b2]" />
                    <Input
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder={ar ? 'ابحث عن منتج بالاسم أو SKU…' : 'Search products by name or SKU…'}
                      className="ps-8 text-xs"
                    />
                  </div>
                  {productLoading && <p className="text-[11px] text-[#9ca3af]">{ar ? 'جارِ البحث…' : 'Searching…'}</p>}
                  {productsError && <p className="text-[11px] text-[#fb323f]">{productsError}</p>}
                  {productResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-[#e3e8ef] bg-white divide-y divide-[#f8fafc]">
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={draftScopeIds.includes(p.id)}
                          onClick={() => toggleScopeId(p.id)}
                          className="w-full text-start px-3 py-2 text-xs text-[#121926] hover:bg-[#f8fafc] cursor-pointer disabled:opacity-50"
                        >
                          {p.name}{' '}
                          <span className="text-[10px] text-[#9ca3af] font-mono" dir="ltr">{p.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {draftScopeIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {draftScopeIds.map((id) => {
                        const prod = productResults.find((p) => p.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#fdf5fa] text-[#b8256e] border border-[#f2c9dd] rounded-md px-1.5 py-0.5"
                          >
                            {prod?.name ?? id}
                            <button type="button" onClick={() => toggleScopeId(id)} className="cursor-pointer hover:text-[#fb323f]">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {modalError && <p className="text-xs text-[#fb323f]">{modalError}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e3e8ef]">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={saveOverride} loading={saving} disabled={!draftKey}>
              {ar ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
