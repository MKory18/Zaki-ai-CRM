'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Globe, Store as StoreIcon } from 'lucide-react';
import { ROLE_LABELS as CANONICAL_LABELS } from '@/types/auth';

/**
 * Creating an employee.
 *
 * Role, countries and stores are asked for here rather than left to a second
 * pass, because an account without a country cannot open a single screen that
 * needs a context — it would be created and immediately be useless. The server
 * writes all of it in one transaction and refuses a store outside its country,
 * so what this form allows and what the API allows are the same thing.
 */

interface CountryRow {
  id: string;
  name: string;
  code: string;
  stores: { id: string; name: string; status: string }[];
}

interface RoleRow { id: string; name: string }

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CANONICAL_LABELS).map(([key, label]) => [key, label.ar])
);

export function CreateUserModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [storeIds, setStoreIds] = useState<string[]>([]);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(''); setEmail(''); setPassword(''); setPhone('');
    setRoleId(''); setCommissionRate('');
    setCountryIds([]); setStoreIds([]); setError(null);

    fetch('/api/roles')
      .then((r) => (r.ok ? r.json() : { roles: [] }))
      .then((d) => setRoles((d.roles ?? []).filter((r: RoleRow) => r.name !== 'SUPER_ADMIN')))
      .catch(() => setRoles([]));
    fetch('/api/geo/countries')
      .then((r) => (r.ok ? r.json() : { countries: [] }))
      .then((d) => setCountries(d.countries ?? []))
      .catch(() => setCountries([]));
  }, [isOpen]);

  /** Dropping a country drops its stores with it — a store he cannot reach
   *  through any country is an assignment the server refuses anyway. */
  function toggleCountry(id: string) {
    setCountryIds((prev) => {
      if (!prev.includes(id)) return [...prev, id];
      const next = prev.filter((c) => c !== id);
      const orphans = countries.find((c) => c.id === id)?.stores.map((s) => s.id) ?? [];
      setStoreIds((s) => s.filter((x) => !orphans.includes(x)));
      return next;
    });
  }

  function toggleStore(id: string) {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const selectedCountries = countries.filter((c) => countryIds.includes(c.id));
  const roleName = roles.find((r) => r.id === roleId)?.name ?? '';

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          roleId: roleId || undefined,
          role: roleName || undefined,
          commissionRate: commissionRate ? Number(commissionRate) : undefined,
          countryIds,
          storeIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر إنشاء الحساب');
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const ready = name.trim().length >= 3 && email.trim() !== '' && password.length >= 8 && roleId !== '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="موظف جديد"
      subtitle="الحساب يُنشأ نشطاً مباشرة — الدور يحدد ما يراه، والدول والمتاجر تحدد أين يعمل"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" />
          <Input
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
          <Input
            label="كلمة المرور"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="8 أحرف على الأقل، وفيها حرف كبير وحرف صغير ورقم"
          />
          <Input label="الهاتف (اختياري)" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select
            label="الدور"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            options={[
              { value: '', label: '— اختر الدور —' },
              ...roles.map((r) => ({ value: r.id, label: ROLE_LABELS[r.name] ?? r.name })),
            ]}
          />
          <Input
            label="نسبة العمولة % (اختياري)"
            type="number"
            min={0}
            max={50}
            step="0.5"
            dir="ltr"
            value={commissionRate}
            onChange={(e) => setCommissionRate(e.target.value)}
          />
        </div>

        <div className="rounded-[8px] border border-[#e3e8ef] p-3 space-y-3">
          <p className="text-xs font-bold text-[#121926] flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-[#b8256e]" />
            الدول التي يعمل فيها
          </p>
          {countries.length === 0 ? (
            <p className="text-[11px] text-[#9aa4b2]">لا توجد دول معرّفة بعد.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {countries.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-[#121926] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={countryIds.includes(c.id)}
                    onChange={() => toggleCountry(c.id)}
                    className="w-4 h-4 accent-[#b8256e] cursor-pointer"
                  />
                  {c.name}
                  <span className="text-[10px] text-[#9aa4b2] font-mono" dir="ltr">{c.code}</span>
                </label>
              ))}
            </div>
          )}

          {selectedCountries.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-[#e3e8ef]">
              <p className="text-xs font-bold text-[#121926] flex items-center gap-1.5 pt-2">
                <StoreIcon className="w-4 h-4 text-[#b8256e]" />
                المتاجر
              </p>
              <p className="text-[11px] text-[#9aa4b2]">
                اتركها فارغة ليصل إلى كل متاجر الدولة، أو اختر متاجر بعينها.
              </p>
              {selectedCountries.map((c) => (
                <div key={c.id} className="rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] p-2.5">
                  <p className="text-[11px] font-bold text-[#364152] mb-1.5">{c.name}</p>
                  {c.stores.length === 0 ? (
                    <p className="text-[11px] text-[#9aa4b2]">لا متاجر في هذه الدولة بعد.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {c.stores.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-[11px] text-[#121926] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={storeIds.includes(s.id)}
                            onChange={() => toggleStore(s.id)}
                            className="w-3.5 h-3.5 accent-[#b8256e] cursor-pointer"
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-[#fb323f]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e3e8ef]">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} loading={saving} disabled={!ready}>إنشاء الحساب</Button>
        </div>
      </div>
    </Modal>
  );
}
