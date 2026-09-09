'use client';

/**
 * SALESFLOW â€” /users/[id]: employee profile.
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
        // Load assignable roles (system + company) â€” server enforces roles.view
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3e97ff]" />
        </div>
      </AppLayout>
    );
  }

  if (error || !user) {
    return (
      <AppLayout>
        <div className="space-y-4 text-center py-16" dir={isRtl ? 'rtl' : 'ltr'}>
          <p className="text-sm text-[#d13b4c]">{error || (ar ? 'ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯' : 'User not found')}</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/users')}>
            {ar ? 'ط¹ظˆط¯ط© ظ„ظ„ظ…ظˆط¸ظپظٹظ†' : 'Back to Employees'}
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
        throw new Error(d.error || (ar ? 'ظپط´ظ„ ط­ظپط¸ ط§ظ„ط¯ظˆط±' : 'Failed to update role'));
      }
      const d = await res.json();
      setUser((prev: any) => ({ ...prev, role: d.user?.role ?? prev.role }));
      setRoleFlash(ar ? 'طھظ… طھط­ط¯ظٹط« ط§ظ„ط¯ظˆط± ط¨ظ†ط¬ط§ط­' : 'Role updated successfully');
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
            {ar ? 'ط¹ظˆط¯ط© ظ„ظ„ظ…ظˆط¸ظپظٹظ†' : 'Back to Employees'}
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
                <p className="text-[10px] text-[#9ca3af] flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{ar ? 'ط§ظ„ط±طھط¨ط©' : 'Role'}</p>
                <p className="font-bold text-[#252f4a]">{user.role}</p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af] flex items-center gap-1"><Clock className="w-3 h-3" />{ar ? 'ط¢ط®ط± ط¯ط®ظˆظ„' : 'Last Login'}</p>
                <p className="font-bold text-[#252f4a]">
                  {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm') : 'â€”'}
                </p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-2.5">
                <p className="text-[10px] text-[#9ca3af]">{ar ? 'طھط§ط±ظٹط® ط§ظ„طھط³ط¬ظٹظ„' : 'Created'}</p>
                <p className="font-bold text-[#252f4a]">{format(new Date(user.createdAt), 'yyyy-MM-dd')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role assignment (roleId-based) */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#4b5675] mb-3 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              {ar ? 'ط§ظ„ط¯ظˆط± ظˆط§ظ„طµظ„ط§ط­ظٹط§طھ' : 'Role & Permissions'}
            </h3>
            {roleFlash && (
              <div className="mb-3 rounded-lg bg-[#e8f8ef] border border-[#d2f0de] text-[#25b865] text-xs font-medium px-3 py-2">
                {roleFlash}
              </div>
            )}
            {roleError && (
              <div className="mb-3 rounded-lg bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs font-medium px-3 py-2">
                {roleError}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <p className="text-[10px] text-[#9ca3af]">{ar ? 'ط§ظ„ط¯ظˆط± ط§ظ„ط­ط§ظ„ظٹ' : 'Current role'}</p>
                <p className="text-sm font-bold text-[#252f4a]">{user.role}</p>
                {effectivePermsCount !== null && (
                  <p className="text-[11px] text-[#6b7177]">
                    {ar ? `${effectivePermsCount} طµظ„ط§ط­ظٹط© ظپط¹ظ‘ط§ظ„ط©` : `${effectivePermsCount} effective permissions`}
                  </p>
                )}
              </div>
              {canAssignRole && roles.length > 0 && (
                <>
                  <div className="flex-1 max-w-xs">
                    <Select
                      label={ar ? 'طھط؛ظٹظٹط± ط§ظ„ط¯ظˆط±' : 'Change role'}
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      options={[
                        { value: '', label: ar ? 'â€” ط§ط®طھط± ط¯ظˆط±ظ‹ط§ â€”' : 'â€” Pick a role â€”' },
                        ...roles.map((r) => ({
                          value: r.id,
                          label: `${r.name}${r.isSystem ? (ar ? ' (ظ†ط¸ط§ظ…ظٹ)' : ' (system)') : ''}`,
                        })),
                      ]}
                    />
                  </div>
                  <Button onClick={saveRole} loading={savingRole} disabled={!selectedRoleId}>
                    {ar ? 'ط­ظپط¸ ط§ظ„ط¯ظˆط±' : 'Save role'}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Effective permissions + user overrides (Phase 5) â€” gated server-side by users.view/users.edit */}
        {userCan(currentUser, 'users.view') && userId && (
          <UserPermissionsSection userId={userId} canEdit={userCan(currentUser, 'users.edit')} />
        )}

        {/* Workload */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#4b5675] mb-3">
              {ar ? 'ط­ط¬ظ… ط§ظ„ط¹ظ…ظ„ ط§ظ„ط­ط§ظ„ظٹ' : 'Current Workload'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-[#eef0f3] px-3 py-4">
                <p className="text-2xl font-black text-[#d13b4c]">{user.workload?.assigned ?? 0}</p>
                <p className="text-[11px] text-[#6b7177] mt-1">{ar ? 'ط·ظ„ط¨ط§طھ ظ…ط³ظ†ط¯ط©' : 'Assigned Orders'}</p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-4">
                <p className="text-2xl font-black text-[#252f4a]">{user.workload?.claimed ?? 0}</p>
                <p className="text-[11px] text-[#6b7177] mt-1">{ar ? 'ط·ظ„ط¨ط§طھ ظ…ط³طھظ„ظ…ط©' : 'Claimed Orders'}</p>
              </div>
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-4">
                <p className="text-2xl font-black text-[#252f4a]">{user.workload?.created ?? 0}</p>
                <p className="text-[11px] text-[#6b7177] mt-1">{ar ? 'ط·ظ„ط¨ط§طھ ظ…ظ†ط´ط£ط©' : 'Created Orders'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// â”€â”€â”€ Phase 5: Effective permissions inspector + user override editor â”€â”€â”€
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
        throw new Error(d.error || (ar ? 'ظپط´ظ„ طھط­ظ…ظٹظ„ ط§ظ„طµظ„ط§ط­ظٹط§طھ' : 'Failed to load permissions'));
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

  // â”€â”€ Effective-permission table rows: roleGrants âˆھ overrides âˆھ effective â”€â”€
  const rows = useMemo<EffectiveRow[]>(() => {
    if (!payload) return [];
    const keys = new Set<string>([
      ...Object.keys(payload.roleGrants),
      ...payload.overrides.map((o) => o.permission),
      ...(payload.effective.fullAccess ? [] : Object.keys(payload.effective.grants)),
    ]);
    // Sort by catalog order (module â†’ item) for a predictable layout
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

  // â”€â”€ Modal helpers â”€â”€
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
      // Permission already has an override â†’ prefill (edit-in-place semantics)
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
      .catch(() => setCategoriesError(ar ? 'طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ظپط¦ط§طھ' : 'Failed to load categories'));
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
        setProductsError(ar ? 'طھط¹ط°ط± ط§ظ„ط¨ط­ط« ظپظٹ ط§ظ„ظ…ظ†طھط¬ط§طھ' : 'Product search failed');
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
      setModalError(ar ? 'ط§ط®طھط± طµظ„ط§ط­ظٹط© ط£ظˆظ„ظ‹ط§' : 'Pick a permission first');
      return;
    }
    if (draftEffect === 'ALLOW' && (draftScope === 'CATEGORY' || draftScope === 'SPECIFIC') && draftScopeIds.length === 0) {
      setModalError(
        draftScope === 'CATEGORY'
          ? (ar ? 'ط§ط®طھط± ظپط¦ط© ظˆط§ط­ط¯ط© ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„' : 'Pick at least one category')
          : (ar ? 'ط§ط®طھط± ظ…ظ†طھط¬ظ‹ط§ ظˆط§ط­ط¯ظ‹ط§ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„' : 'Pick at least one product')
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
        throw new Error(d.error || (ar ? 'ظپط´ظ„ ط­ظپط¸ ط§ظ„ط§ط³طھط«ظ†ط§ط،ط§طھ' : 'Failed to save overrides'));
      }
      setModalOpen(false);
      showFlash(ar ? 'طھظ… ط­ظپط¸ ط§ظ„ط§ط³طھط«ظ†ط§ط،ط§طھ ط¨ظ†ط¬ط§ط­' : 'Overrides saved successfully');
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
        throw new Error(d.error || (ar ? 'ظپط´ظ„ ط¥ط²ط§ظ„ط© ط§ظ„ط§ط³طھط«ظ†ط§ط،' : 'Failed to remove override'));
      }
      showFlash(ar ? 'طھظ… ط¥ط²ط§ظ„ط© ط§ظ„ط§ط³طھط«ظ†ط§ط،' : 'Override removed');
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
      {/* Card 1 â€” Effective permissions */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-xs font-black uppercase tracking-wide text-[#4b5675] mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            {ar ? 'ط§ظ„طµظ„ط§ط­ظٹط§طھ ط§ظ„ظپط¹ظ‘ط§ظ„ط©' : 'Effective Permissions'}
          </h3>

          {loadError && (
            <div className="rounded-lg bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs font-medium px-3 py-2 mb-3 flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={loadPerms}>
                {ar ? 'ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط©' : 'Retry'}
              </Button>
            </div>
          )}

          {!payload && !loadError && (
            <p className="text-xs text-[#9ca3af] py-3">{ar ? 'ط¬ط§ط±ظگ ط§ظ„طھط­ظ…ظٹظ„â€¦' : 'Loadingâ€¦'}</p>
          )}

          {payload && (
            <>
              {/* Summary line */}
              <div className="rounded-xl bg-[#f8f9fa] px-3 py-2.5 text-xs text-[#4b5675] mb-3 flex flex-wrap gap-x-3 gap-y-1">
                <span className="font-bold text-[#252f4a]">
                  {ar ? `ط§ظ„ط¯ظˆط±: ${payload.role.name}` : `Role: ${payload.role.name}`}
                </span>
                <span>
                  â€¢{' '}
                  {isFullAccess
                    ? (ar ? 'ظˆطµظˆظ„ ظƒط§ظ…ظ„ (ظƒظ„ ط§ظ„طµظ„ط§ط­ظٹط§طھ)' : 'Full access (all permissions)')
                    : (ar ? `${effectiveCount} طµظ„ط§ط­ظٹط© ظپط¹ظ‘ط§ظ„ط©` : `${effectiveCount} effective permissions`)}
                </span>
                <span>â€¢ {ar ? `${overrideCount} ط§ط³طھط«ظ†ط§ط،` : `${overrideCount} overrides`}</span>
              </div>

              {isFullAccess ? (
                <p className="text-xs text-[#6b7177]">
                  {ar
                    ? 'ط­ط³ط§ط¨ SUPER_ADMIN â€” ظˆطµظˆظ„ ظƒط§ظ…ظ„ ظ…ط±ظƒط²ظٹظ‹ط§ ظˆظ„ط§ ظٹظ‚ط¨ظ„ ط§ط³طھط«ظ†ط§ط،ط§طھ.'
                    : 'SUPER_ADMIN account â€” central full access; overrides do not apply.'}
                </p>
              ) : (
                <>
                  <div className="relative max-w-xs mb-3">
                    <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[#9aa0aa]" />
                    <Input
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder={ar ? 'ط¨ط­ط« ظپظٹ ط§ظ„طµظ„ط§ط­ظٹط§طھâ€¦' : 'Search permissionsâ€¦'}
                      className="ps-8 text-xs"
                    />
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-[#eef0f3]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#f8f9fa] text-[#4b5675]">
                          <th className="text-start font-bold px-3 py-2">{ar ? 'ط§ظ„طµظ„ط§ط­ظٹط©' : 'Permission'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'ظ…ظ† ط§ظ„ط¯ظˆط±' : 'Role'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'ط§ظ„ط§ط³طھط«ظ†ط§ط،' : 'Override'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'ط§ظ„ظپط¹ظ‘ط§ظ„ط©' : 'Effective'}</th>
                          <th className="text-start font-bold px-3 py-2">{ar ? 'ط§ظ„ظ†ط·ط§ظ‚' : 'Scope'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f3f4f6]">
                        {filteredRows.map((r) => (
                          <tr key={r.key} className="hover:bg-[#f8f9fa]/60">
                            <td className="px-3 py-2 min-w-[160px]">
                              <p className="font-medium text-[#252f4a]">{ar ? r.ar : r.en}</p>
                              <p className="text-[10px] text-[#9ca3af] font-mono" dir="ltr">{r.key}</p>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.roleEffect ? (
                                <span className="font-bold text-[#25b865]">ALLOW آ· {ar ? 'ظ…ظˆط±ظˆط«' : 'inherited'}</span>
                              ) : (
                                <span className="text-[#9ca3af]">{ar ? 'ط؛ظٹط± ظ…ظ…ظ†ظˆط­' : 'not granted'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.overrideEffect ? (
                                <span className={`font-bold ${r.overrideEffect === 'DENY' ? 'text-[#d13b4c]' : 'text-[#25b865]'}`}>
                                  {r.overrideEffect} آ· {r.overrideEffect === 'DENY' ? (ar ? 'ظ…ظ†ط¹' : 'deny') : (ar ? 'ط¥ط¶ط§ظپط©' : 'allow')}
                                </span>
                              ) : (
                                <span className="text-[#9ca3af]">â€”</span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.effectiveEffect === 'ALLOW' ? (
                                <span className="font-bold text-[#25b865]">ALLOW</span>
                              ) : (
                                <span className="font-bold text-[#d13b4c]">
                                  DENY <span className="font-medium">آ· {ar ? 'ظ…ظ…ظ†ظˆط¹' : 'denied'}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#6b7177] whitespace-nowrap">{r.scopeLabel ?? 'â€”'}</td>
                          </tr>
                        ))}
                        {filteredRows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-[#9ca3af]">
                              {ar ? 'ظ„ط§ ظ†طھط§ط¦ط¬ ظ…ط·ط§ط¨ظ‚ط© ظ„ظ„ط¨ط­ط«' : 'No matching permissions'}
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

      {/* Card 2 â€” User overrides */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#4b5675] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              {ar ? 'ط§ط³طھط«ظ†ط§ط،ط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ…' : 'User Overrides'}
            </h3>
            {canEdit && !isFullAccess && (
              <Button size="sm" onClick={openAddModal}>
                <Plus className="w-3.5 h-3.5" />
                {ar ? 'ط¥ط¶ط§ظپط© ط§ط³طھط«ظ†ط§ط،' : 'Add override'}
              </Button>
            )}
          </div>

          {flash && (
            <div className="mb-3 rounded-lg bg-[#e8f8ef] border border-[#d2f0de] text-[#25b865] text-xs font-medium px-3 py-2">
              {flash}
            </div>
          )}

          {payload && isFullAccess && (
            <p className="text-xs text-[#6b7177]">
              {ar ? 'ظ„ط§ طھظˆط¬ط¯ ط§ط³طھط«ظ†ط§ط،ط§طھ â€” ط­ط³ط§ط¨ SUPER_ADMIN ظˆطµظˆظ„ ظƒط§ظ…ظ„.' : 'No overrides â€” SUPER_ADMIN has central full access.'}
            </p>
          )}

          {payload && !isFullAccess && (
            payload.overrides.length === 0 ? (
              <p className="text-xs text-[#6b7177]">
                {ar
                  ? 'ظ„ط§ طھظˆط¬ط¯ ط§ط³طھط«ظ†ط§ط،ط§طھ â€” ط§ظ„طµظ„ط§ط­ظٹط§طھ طھط£طھظٹ ظ…ظ† ط§ظ„ط¯ظˆط± ظƒظ…ط§ ظ‡ظٹ.'
                  : 'No overrides â€” permissions come from the role as-is.'}
              </p>
            ) : (
              <ul className="divide-y divide-[#f3f4f6] rounded-xl border border-[#eef0f3]">
                {payload.overrides.map((o) => {
                  const item = catalogItem(o.permission);
                  const scopeLabel = o.scope
                    ? (SCOPE_LABELS[o.scope as ScopeValue]?.[ar ? 'ar' : 'en'] ?? o.scope)
                    : null;
                  return (
                    <li key={o.permission} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#252f4a] truncate">
                          {ar ? item?.ar ?? o.permission : item?.en ?? o.permission}
                        </p>
                        <p className="text-[10px] text-[#9ca3af] font-mono" dir="ltr">{o.permission}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold rounded-[5px] px-2 py-0.5 border ${
                            o.effect === 'DENY'
                              ? 'text-[#d13b4c] bg-[#fbeeef] border-[#f4d7da]'
                              : 'text-[#25b865] bg-[#e8f8ef] border-[#d2f0de]'
                          }`}
                        >
                          {o.effect === 'DENY' ? `DENY آ· ${ar ? 'ظ…ظ†ط¹' : 'deny'}` : `ALLOW آ· ${ar ? 'ط¥ط¶ط§ظپط©' : 'allow'}`}
                        </span>
                        {o.effect === 'ALLOW' && scopeLabel && (
                          <span className="text-[10px] text-[#6b7177]">{scopeLabel}</span>
                        )}
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[#d13b4c]"
                            loading={removing === o.permission}
                            onClick={() => removeOverride(o.permission)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {ar ? 'ط¥ط²ط§ظ„ط©' : 'Remove'}
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
        title={draftIsEdit ? (ar ? 'طھط¹ط¯ظٹظ„ ط§ط³طھط«ظ†ط§ط، ظ‚ط§ط¦ظ…' : 'Edit existing override') : (ar ? 'ط¥ط¶ط§ظپط© ط§ط³طھط«ظ†ط§ط،' : 'Add Override')}
        subtitle={ar ? 'ط§ظ„ط§ط³طھط«ظ†ط§ط، ظٹط®طµ ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… ظپظ‚ط· ظˆظٹطھط¬ط§ظˆط² طµظ„ط§ط­ظٹط§طھ ط§ظ„ط¯ظˆط±' : 'Overrides apply to this user only, on top of the role'}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {/* Permission picker â€” grouped by module from the catalog */}
          <Select
            label={ar ? 'ط§ظ„طµظ„ط§ط­ظٹط©' : 'Permission'}
            value={draftKey}
            onChange={(e) => onDraftKeyChange(e.target.value)}
          >
            <option value="">{ar ? 'â€” ط§ط®طھط± طµظ„ط§ط­ظٹط© â€”' : 'â€” Pick a permission â€”'}</option>
            {PERMISSION_MODULES.map((m) => (
              <optgroup key={m.module} label={ar ? MODULE_LABELS[m.module]?.ar ?? m.module : MODULE_LABELS[m.module]?.en ?? m.module}>
                {m.items.map((i) => (
                  <option key={i.key} value={i.key}>
                    {ar ? i.ar : i.en}
                    {overridesMap.has(i.key) ? (ar ? ' (ظ„ط¯ظٹظ‡ ط§ط³طھط«ظ†ط§ط،)' : ' (has override)') : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          {/* Effect radio â€” text labels, never color alone */}
          <div>
            <p className="block text-xs font-medium text-[#252f4a] mb-1.5">{ar ? 'ظ†ظˆط¹ ط§ظ„ط§ط³طھط«ظ†ط§ط،' : 'Effect'}</p>
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-1.5 text-xs text-[#252f4a] cursor-pointer">
                <input
                  type="radio"
                  name="override-effect"
                  checked={draftEffect === 'ALLOW'}
                  onChange={() => setDraftEffect('ALLOW')}
                  className="w-3.5 h-3.5 accent-[#25b865] cursor-pointer"
                />
                ALLOW آ· {ar ? 'ظ…ظ†ط­ (ظٹطھط¬ط§ظˆط² ط§ظ„ط¯ظˆط±)' : 'grant'}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[#252f4a] cursor-pointer">
                <input
                  type="radio"
                  name="override-effect"
                  checked={draftEffect === 'DENY'}
                  onChange={() => setDraftEffect('DENY')}
                  className="w-3.5 h-3.5 accent-[#d13b4c] cursor-pointer"
                />
                DENY آ· {ar ? 'ظ…ظ†ط¹ (ظٹط­ط¬ط¨ ط­طھظ‰ ظ„ظˆ ط³ظ…ط­ ط§ظ„ط¯ظˆط±)' : 'deny'}
              </label>
              {/* Advanced toggle â€” scopes stay hidden for ordinary permission changes */}
              <label className="flex items-center gap-1.5 text-xs text-[#6b7177] cursor-pointer ms-auto">
                <input
                  type="checkbox"
                  checked={advancedScopes}
                  onChange={(e) => {
                    setAdvancedScopes(e.target.checked);
                    if (!e.target.checked) onDraftScopeChange('ALL_COMPANY');
                  }}
                  className="w-3.5 h-3.5 accent-[#3e97ff] cursor-pointer"
                />
                {ar ? 'طھط®طµظٹطµ ظ†ط·ط§ظ‚ ط§ظ„ظˆطµظˆظ„' : 'Customize access scope'}
              </label>
            </div>
          </div>

          {/* Scope â€” only meaningful for ALLOW (DENY blocks regardless of scope);
              hidden behind the advanced toggle for ordinary permission changes */}
          {draftEffect === 'ALLOW' && advancedScopes && (
            <>
              <Select
                label={ar ? 'ط§ظ„ظ†ط·ط§ظ‚' : 'Scope'}
                value={draftScope}
                onChange={(e) => onDraftScopeChange(e.target.value as ScopeValue)}
                options={(catalogItem(draftKey)?.scopes ?? ['ALL_COMPANY']).map((s) => ({
                  value: s,
                  label: ar ? SCOPE_LABELS[s].ar : SCOPE_LABELS[s].en,
                }))}
              />

              {draftKey && draftScope === 'CATEGORY' && (
                <div className="rounded-lg bg-[#f8f9fa] border border-[#eef0f3] p-3">
                  {categoriesError && <p className="text-[11px] text-[#d13b4c]">{categoriesError}</p>}
                  {!categoriesError && categories.length === 0 && (
                    <p className="text-[11px] text-[#9ca3af]">{ar ? 'ظ„ط§ طھظˆط¬ط¯ ظپط¦ط§طھ ط¨ط¹ط¯' : 'No categories yet'}</p>
                  )}
                  {categories.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {categories.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-[11px] text-[#252f4a] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draftScopeIds.includes(c.id)}
                            onChange={() => toggleScopeId(c.id)}
                            className="w-3.5 h-3.5 accent-[#3e97ff] cursor-pointer"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {draftKey && draftScope === 'SPECIFIC' && (
                <div className="rounded-lg bg-[#f8f9fa] border border-[#eef0f3] p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[#9aa0aa]" />
                    <Input
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder={ar ? 'ط§ط¨ط­ط« ط¹ظ† ظ…ظ†طھط¬ ط¨ط§ظ„ط§ط³ظ… ط£ظˆ SKUâ€¦' : 'Search products by name or SKUâ€¦'}
                      className="ps-8 text-xs"
                    />
                  </div>
                  {productLoading && <p className="text-[11px] text-[#9ca3af]">{ar ? 'ط¬ط§ط±ظگ ط§ظ„ط¨ط­ط«â€¦' : 'Searchingâ€¦'}</p>}
                  {productsError && <p className="text-[11px] text-[#d13b4c]">{productsError}</p>}
                  {productResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-[#eef0f3] bg-white divide-y divide-[#f3f4f6]">
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={draftScopeIds.includes(p.id)}
                          onClick={() => toggleScopeId(p.id)}
                          className="w-full text-start px-3 py-2 text-xs text-[#252f4a] hover:bg-[#f8f9fa] cursor-pointer disabled:opacity-50"
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
                            className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#eaf3ff] text-[#3e97ff] border border-[#d6e8ff] rounded-md px-1.5 py-0.5"
                          >
                            {prod?.name ?? id}
                            <button type="button" onClick={() => toggleScopeId(id)} className="cursor-pointer hover:text-[#d13b4c]">
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

          {modalError && <p className="text-xs text-[#d13b4c]">{modalError}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eef0f3]">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {ar ? 'ط¥ظ„ط؛ط§ط،' : 'Cancel'}
            </Button>
            <Button onClick={saveOverride} loading={saving} disabled={!draftKey}>
              {ar ? 'ط­ظپط¸' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
