'use client';

/**
 * SALESFLOW — /roles: Roles & Permissions management.
 * List + create/edit permission matrix + duplicate + delete with reassignment.
 * All enforcement is server-side; this UI gates mutations with userCan().
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import {
  PERMISSION_MODULES, MODULE_LABELS, SCOPE_LABELS,
  type ScopeValue, type CatalogItem,
} from '@/lib/permission-catalog';
import { format } from 'date-fns';
import {
  ShieldCheck, Search, Plus, Pencil, Copy, Trash2, ChevronDown, ChevronUp, Users, KeyRound, X,
} from 'lucide-react';

interface RolePerm { permission: string; scope: string; scopeIds?: unknown }
interface RoleRow {
  id: string;
  companyId: string | null;
  name: string;
  isSystem: boolean;
  createdAt: string;
  usersCount: number;
  permissionsCount: number;
  permissions: RolePerm[];
}

interface DraftPerm { scope: ScopeValue; scopeIds: string[] }

const DEBOUNCE_MS = 350;

export default function RolesPage() {
  const { locale, isRtl, currentUser } = useApp();
  const ar = locale === 'ar';

  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<Record<string, DraftPerm>>({});
  const [moduleSearch, setModuleSearch] = useState('');
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Delete state
  const [deletingRole, setDeletingRole] = useState<RoleRow | null>(null);
  const [replacementRoleId, setReplacementRoleId] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Duplicate state
  const [duplicatingRole, setDuplicatingRole] = useState<RoleRow | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  // Scope pickers
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<{ id: string; name: string }[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productPage, setProductPage] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canEdit = userCan(currentUser, 'roles.edit');
  const canCreate = userCan(currentUser, 'roles.create');
  const canDelete = userCan(currentUser, 'roles.delete');
  const isSuper = currentUser?.role === 'SUPER_ADMIN';

  const loadRoles = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/roles');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (ar ? 'فشل تحميل الأدوار' : 'Failed to load roles'));
      }
      const data = await res.json();
      setRoles(data.roles);
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, [ar]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, search]);

  // ── Editor helpers ──
  function openCreate() {
    setEditingRole(null);
    setName('');
    setDraft({});
    setModuleSearch('');
    setOpenModules({});
    setEditorError(null);
    setEditorOpen(true);
  }

  function openEdit(role: RoleRow) {
    setEditingRole(role);
    setName(role.name);
    const d: Record<string, DraftPerm> = {};
    for (const p of role.permissions) {
      d[p.permission] = {
        scope: (p.scope as ScopeValue) || 'ALL_COMPANY',
        scopeIds: Array.isArray(p.scopeIds) ? (p.scopeIds as string[]) : [],
      };
    }
    setDraft(d);
    setModuleSearch('');
    setOpenModules({});
    setEditorError(null);
    setEditorOpen(true);
  }

  function togglePerm(item: CatalogItem) {
    setDraft((prev) => {
      const next = { ...prev };
      if (next[item.key]) delete next[item.key];
      else next[item.key] = { scope: 'ALL_COMPANY', scopeIds: [] };
      return next;
    });
  }

  function setScope(key: string, scope: ScopeValue) {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], scope, scopeIds: [] } }));
  }

  function toggleScopeId(key: string, id: string) {
    setDraft((prev) => {
      const cur = prev[key];
      const ids = cur.scopeIds.includes(id) ? cur.scopeIds.filter((x) => x !== id) : [...cur.scopeIds, id];
      return { ...prev, [key]: { ...cur, scopeIds: ids } };
    });
  }

  // Load categories when a CATEGORY scope is active.
  useEffect(() => {
    const needsCategories = Object.values(draft).some((d) => d.scope === 'CATEGORY');
    if (needsCategories && categories.length === 0) {
      fetch('/api/categories')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
        .then((d) => setCategories(d.categories ?? []))
        .catch(() => setCategories([]));
    }
  }, [draft, categories.length]);

  // Debounced product search for SPECIFIC scope.
  const activeSpecific = Object.entries(draft).some(([, d]) => d.scope === 'SPECIFIC');
  useEffect(() => {
    if (!activeSpecific) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setProductLoading(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(productQuery)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          const list: any[] = Array.isArray(data) ? data : (data.products ?? []);
          const q = productQuery.trim().toLowerCase();
          const filtered = q
            ? list.filter((p: any) => (p.name ?? '').toLowerCase().includes(q) || (p.nameEn ?? '').toLowerCase().includes(q))
            : list;
          setProductResults(filtered.slice(0, 50).map((p: any) => ({ id: p.id, name: p.name })));
          setProductPage(0);
        }
      } finally {
        setProductLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [productQuery, activeSpecific, editorOpen, editingRole]);

  async function saveEditor() {
    if (!name.trim()) {
      setEditorError(ar ? 'اسم الدور مطلوب' : 'Role name is required');
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const permissions = Object.entries(draft).map(([permission, d]) => ({
        permission,
        scope: d.scope,
        scopeIds: d.scopeIds.length ? d.scopeIds : undefined,
      }));
      const url = editingRole ? `/api/roles/${editingRole.id}` : '/api/roles';
      const res = await fetch(url, {
        method: editingRole ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRole ? { name, permissions } : { name, permissions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.errorAr || (ar ? 'فشل الحفظ' : 'Save failed'));
      }
      setEditorOpen(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await loadRoles();
    } catch (e: any) {
      setEditorError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openDuplicate(role: RoleRow) {
    setDuplicatingRole(role);
    setDuplicateName(`${role.name} (نسخة)`);
  }

  async function confirmDuplicate() {
    if (!duplicatingRole) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/roles/${duplicatingRole.id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (ar ? 'فشل النسخ' : 'Duplicate failed'));
      }
      setDuplicatingRole(null);
      await loadRoles();
    } catch (e: any) {
      setDeleteError(e.message);
      setDuplicatingRole(null);
    } finally {
      setDuplicating(false);
    }
  }

  async function confirmDelete() {
    if (!deletingRole) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const needsReplacement = deletingRole.usersCount > 0;
      if (needsReplacement && !replacementRoleId) {
        throw new Error(ar ? 'اختر دورًا بديلًا أولًا' : 'Pick a replacement role first');
      }
      const url = needsReplacement
        ? `/api/roles/${deletingRole.id}?replacementRoleId=${encodeURIComponent(replacementRoleId)}`
        : `/api/roles/${deletingRole.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.errorAr || data.error || (ar ? 'فشل الحذف' : 'Delete failed'));
      }
      setDeletingRole(null);
      await loadRoles();
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  // ── Matrix filtering ──
  const visibleModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return PERMISSION_MODULES;
    return PERMISSION_MODULES
      .map((m) => ({
        ...m,
        items: m.items.filter(
          (i) => i.key.toLowerCase().includes(q) || i.ar.includes(q) || i.en.toLowerCase().includes(q)
        ),
      }))
      .filter((m) => m.items.length > 0);
  }, [moduleSearch]);

  const activeCount = Object.keys(draft).length;

  return (
    <AppLayout>
      <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a] flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[#3e97ff]" />
              {ar ? 'الأدوار والصلاحيات' : 'Roles & Permissions'}
            </h1>
            <p className="text-xs text-[#6b7177] mt-1">
              {ar
                ? 'إدارة أدوار الفريق وصلاحياتهم — تُطبق التغييرات فورًا على الخادم.'
                : 'Manage team roles and their permissions — changes apply server-side immediately.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-52">
              <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-4 h-4 text-[#9aa0aa]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ar ? 'بحث عن دور…' : 'Search roles…'}
                className="ps-8"
              />
            </div>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" />
                {ar ? 'دور جديد' : 'New Role'}
              </Button>
            )}
          </div>
        </div>

        {savedFlash && (
          <div className="rounded-lg bg-[#e8f8ef] border border-[#d2f0de] text-[#25b865] text-xs font-medium px-4 py-2.5">
            {ar ? '✓ تم الحفظ بنجاح' : '✓ Saved successfully'}
          </div>
        )}

        {loadError && (
          <Card>
            <CardContent className="text-center py-10 space-y-3">
              <p className="text-sm text-[#d13b4c]">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadRoles}>{ar ? 'إعادة المحاولة' : 'Retry'}</Button>
            </CardContent>
          </Card>
        )}

        {roles && filteredRoles.length === 0 && !loadError && (
          <Card>
            <CardContent className="text-center py-12">
              <ShieldCheck className="w-10 h-10 text-[#c3c8d4] mx-auto mb-3" />
              <p className="text-sm text-[#6b7177]">
                {search ? (ar ? 'لا نتائج مطابقة للبحث' : 'No roles match your search') : (ar ? 'لا توجد أدوار بعد' : 'No roles yet')}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredRoles.map((role) => {
            const isSuperAdminRole = role.name === 'SUPER_ADMIN';
            const canEditThis = canEdit && (!role.isSystem || isSuper || currentUser?.role === 'COMPANY_ADMIN') && !isSuperAdminRole;
            const canDeleteThis = canDelete && !role.isSystem;
            return (
              <Card key={role.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#252f4a]">{role.name}</p>
                        <Badge variant={role.companyId === null ? 'info' : 'default'}>
                          {role.companyId === null ? (ar ? 'دور نظامي' : 'System') : (ar ? 'دور شركة' : 'Company')}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[#9ca3af] mt-1">
                        {ar ? 'أُنشئ' : 'Created'} {format(new Date(role.createdAt), 'yyyy-MM-dd')}
                      </p>
                    </div>
                    {isSuperAdminRole && (
                      <span title={ar ? 'وصول كامل مركزيًا' : 'Central full access'} className="cursor-help">
                        <Badge variant="purple"><ShieldCheck className="w-3 h-3 me-1" />{ar ? 'وصول كامل مركزيًا' : 'Full access'}</Badge>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-xs text-[#6b7177]">
                    <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{role.usersCount} {ar ? 'مستخدم' : 'users'}</span>
                    <span className="inline-flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" />{role.permissionsCount} {ar ? 'صلاحية' : 'permissions'}</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-4">
                    {isSuperAdminRole ? (
                      <span className="text-[11px] text-[#9ca3af]" title={ar ? 'وصول كامل مركزيًا' : 'Central full access'}>
                        {ar ? 'قراءة فقط' : 'Read-only'}
                      </span>
                    ) : (
                      <>
                        {canEditThis && (
                          <Button variant="outline" size="sm" onClick={() => openEdit(role)}>
                            <Pencil className="w-3.5 h-3.5" />{ar ? 'تعديل' : 'Edit'}
                          </Button>
                        )}
                        {canCreate && (
                          <Button variant="outline" size="sm" onClick={() => openDuplicate(role)}>
                            <Copy className="w-3.5 h-3.5" />{ar ? 'نسخ' : 'Duplicate'}
                          </Button>
                        )}
                        {canDeleteThis && (
                          <Button variant="outline" size="sm" className="text-[#d13b4c]" onClick={() => { setDeletingRole(role); setReplacementRoleId(''); setDeleteError(null); }}>
                            <Trash2 className="w-3.5 h-3.5" />{ar ? 'حذف' : 'Delete'}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Create/Edit modal ── */}
        <Modal
          isOpen={editorOpen}
          onClose={() => setEditorOpen(false)}
          title={editingRole ? (ar ? `تعديل الدور: ${editingRole.name}` : `Edit role: ${editingRole.name}`) : (ar ? 'دور جديد' : 'New Role')}
          subtitle={ar ? 'فعّل الصلاحيات وحدّد نطاقها عند الحاجة' : 'Enable permissions and set their scope where needed'}
          maxWidth="4xl"
        >
          <div className="space-y-4">
            <Input
              label={ar ? 'اسم الدور' : 'Role name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ar ? 'مثال: موظف تأكيد الطلبات' : 'e.g. Order Confirmation Agent'}
              error={editorError ?? undefined}
            />

            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-4 h-4 text-[#9aa0aa]" />
                <Input
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  placeholder={ar ? 'بحث في الصلاحيات…' : 'Search permissions…'}
                  className="ps-8"
                />
              </div>
              <Badge variant={activeCount > 0 ? 'success' : 'default'}>
                {activeCount} {ar ? 'صلاحية مفعّلة' : 'enabled'}
              </Badge>
            </div>

            <div className="space-y-2">
              {visibleModules.map((m) => {
                const open = openModules[m.module] ?? false;
                const moduleActive = m.items.filter((i) => draft[i.key]).length;
                return (
                  <div key={m.module} className="rounded-xl border border-[#eef0f3] overflow-hidden">
                    <button
                      onClick={() => setOpenModules((p) => ({ ...p, [m.module]: !p[m.module] }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#f8f9fa] hover:bg-[#eef0f3]/60 transition-colors cursor-pointer text-start"
                    >
                      <span className="text-xs font-bold text-[#252f4a]">
                        {ar ? MODULE_LABELS[m.module]?.ar ?? m.module : MODULE_LABELS[m.module]?.en ?? m.module}
                        {moduleActive > 0 && (
                          <span className="ms-2 text-[10px] font-bold text-[#25b865] bg-[#e8f8ef] rounded-md px-1.5 py-0.5">
                            {moduleActive}
                          </span>
                        )}
                      </span>
                      {open ? <ChevronUp className="w-4 h-4 text-[#9ca3af]" /> : <ChevronDown className="w-4 h-4 text-[#9ca3af]" />}
                    </button>
                    {open && (
                      <div className="divide-y divide-[#f3f4f6]">
                        {m.items.map((item) => {
                          const d = draft[item.key];
                          return (
                            <div key={item.key} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={!!d}
                                    onChange={() => togglePerm(item)}
                                    className="w-4 h-4 accent-[#3e97ff] cursor-pointer shrink-0"
                                  />
                                  <span className="text-xs text-[#252f4a] font-medium truncate">
                                    {ar ? item.ar : item.en}
                                  </span>
                                  <span className="text-[10px] text-[#9ca3af] font-mono hidden sm:inline truncate" dir="ltr">{item.key}</span>
                                </label>
                                {d && item.scopes && item.scopes.length > 1 && (
                                  <div className="w-44 shrink-0">
                                    <Select
                                      value={d.scope}
                                      onChange={(e) => setScope(item.key, e.target.value as ScopeValue)}
                                      options={item.scopes.map((s) => ({
                                        value: s,
                                        label: ar ? SCOPE_LABELS[s].ar : SCOPE_LABELS[s].en,
                                      }))}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* CATEGORY scope → category checkboxes */}
                              {d && d.scope === 'CATEGORY' && (
                                <div className="mt-2 ms-6 rounded-lg bg-[#f8f9fa] border border-[#eef0f3] p-3">
                                  {categories.length === 0 ? (
                                    <p className="text-[11px] text-[#9ca3af]">{ar ? 'لا توجد فئات بعد' : 'No categories yet'}</p>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                      {categories.map((c) => (
                                        <label key={c.id} className="flex items-center gap-1.5 text-[11px] text-[#252f4a] cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={d.scopeIds.includes(c.id)}
                                            onChange={() => toggleScopeId(item.key, c.id)}
                                            className="w-3.5 h-3.5 accent-[#3e97ff] cursor-pointer"
                                          />
                                          {c.name}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* SPECIFIC scope → product search + chips */}
                              {d && d.scope === 'SPECIFIC' && (
                                <div className="mt-2 ms-6 rounded-lg bg-[#f8f9fa] border border-[#eef0f3] p-3 space-y-2">
                                  <div className="relative">
                                    <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[#9aa0aa]" />
                                    <Input
                                      value={productQuery}
                                      onChange={(e) => setProductQuery(e.target.value)}
                                      placeholder={ar ? 'ابحث عن منتج بالاسم…' : 'Search products by name…'}
                                      className="ps-8 text-xs"
                                    />
                                  </div>
                                  {productLoading && <p className="text-[11px] text-[#9ca3af]">{ar ? 'جارِ البحث…' : 'Searching…'}</p>}
                                  {productResults.length > 0 && (
                                    <div className="max-h-36 overflow-y-auto rounded-lg border border-[#eef0f3] bg-white divide-y divide-[#f3f4f6]">
                                      {productResults.slice(0, (productPage + 1) * 10).map((p) => (
                                        <button
                                          key={p.id}
                                          onClick={() => !d.scopeIds.includes(p.id) && toggleScopeId(item.key, p.id)}
                                          className="w-full text-start px-3 py-2 text-xs text-[#252f4a] hover:bg-[#f8f9fa] cursor-pointer"
                                        >
                                          {p.name}
                                        </button>
                                      ))}
                                      {(productPage + 1) * 10 < productResults.length && (
                                        <button
                                          onClick={() => setProductPage((p) => p + 1)}
                                          className="w-full px-3 py-2 text-[11px] font-bold text-[#3e97ff] hover:bg-[#f8f9fa] cursor-pointer"
                                        >
                                          {ar ? 'تحميل المزيد' : 'Load more'}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {d.scopeIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {d.scopeIds.map((id) => {
                                        const prod = productResults.find((p) => p.id === id);
                                        return (
                                          <span key={id} className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#eaf3ff] text-[#3e97ff] border border-[#d6e8ff] rounded-md px-1.5 py-0.5">
                                            {prod?.name ?? id}
                                            <button onClick={() => toggleScopeId(item.key, id)} className="cursor-pointer hover:text-[#d13b4c]">
                                              <X className="w-3 h-3" />
                                            </button>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleModules.length === 0 && (
                <p className="text-xs text-[#9ca3af] text-center py-6">{ar ? 'لا صلاحيات مطابقة' : 'No matching permissions'}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eef0f3]">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={saveEditor} loading={saving}>
                {editingRole ? (ar ? 'حفظ التغييرات' : 'Save changes') : (ar ? 'إنشاء الدور' : 'Create role')}
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Delete modal ── */}
        <Modal
          isOpen={!!deletingRole}
          onClose={() => setDeletingRole(null)}
          title={ar ? 'حذف الدور' : 'Delete Role'}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#252f4a]">
              {ar
                ? `هل أنت متأكد من حذف الدور «${deletingRole?.name}»؟`
                : `Delete role "${deletingRole?.name}"?`}
            </p>
            {deletingRole && deletingRole.usersCount > 0 && (
              <div className="rounded-lg bg-[#fdf4e8] border border-[#f9e6cc] p-3 space-y-2">
                <p className="text-xs font-bold text-[#c07f2a]">
                  {ar
                    ? `هذا الدور مرتبط بـ ${deletingRole.usersCount} مستخدم. اختر دورًا بديلًا:`
                    : `${deletingRole.usersCount} user(s) hold this role. Pick a replacement:`}
                </p>
                <Select
                  value={replacementRoleId}
                  onChange={(e) => setReplacementRoleId(e.target.value)}
                  options={[
                    { value: '', label: ar ? '— اختر الدور البديل —' : '— Pick replacement role —' },
                    ...(roles ?? [])
                      .filter((r) => r.id !== deletingRole.id)
                      .map((r) => ({ value: r.id, label: r.name })),
                  ]}
                />
              </div>
            )}
            {deleteError && <p className="text-xs text-[#d13b4c]">{deleteError}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingRole(null)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="danger" onClick={confirmDelete} loading={deleting}>{ar ? 'حذف نهائي' : 'Delete'}</Button>
            </div>
          </div>
        </Modal>

        {/* ── Duplicate modal ── */}
        <Modal
          isOpen={!!duplicatingRole}
          onClose={() => setDuplicatingRole(null)}
          title={ar ? 'نسخ الدور' : 'Duplicate Role'}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <Input
              label={ar ? 'اسم الدور الجديد' : 'New role name'}
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setDuplicatingRole(null)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={confirmDuplicate} loading={duplicating}>{ar ? 'نسخ' : 'Duplicate'}</Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
