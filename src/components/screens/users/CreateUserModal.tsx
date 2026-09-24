'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Check, Circle, Globe, Store as StoreIcon } from 'lucide-react';
import { PASSWORD_RULES, passwordProblems } from '@/lib/password-rules';
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
  /** The account just created — the screen offers to open its permissions. */
  onCreated: (user: { id: string; name: string } | null) => void;
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
      onCreated(data.user ?? null);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  /**
   * What is still missing, named.
   *
   * The button used to be disabled with nothing said, on a form long
   * enough that the offending field was off-screen. Pressing a dead button
   * and being told nothing is how somebody decides the page is broken.
   */
  const missing = [
    name.trim().length < 3 ? 'الاسم (٣ أحرف على الأقل)' : null,
    email.trim() === '' ? 'البريد الإلكتروني' : null,
    passwordProblems(password).length > 0
      ? `كلمة المرور (${passwordProblems(password).map((r) => r.ar).join('، ')})`
      : null,
    roleId === '' ? 'الدور' : null,
  ].filter(Boolean) as string[];
  const ready = missing.length === 0;

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
          <div>
            <Input
              label="كلمة المرور"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {/* The server's own rules, each ticking as it is met. The form
                used to check only the length, so it said ready for a
                password the server then refused. */}
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li
                    key={rule.key}
                    className={`flex items-center gap-1 text-[11px] ${met ? 'text-[#00994d]' : 'text-[#9aa4b2]'}`}
                  >
                    {met ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
                    {rule.ar}
                  </li>
                );
              })}
            </ul>
          </div>
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


        {/* Stuck to the bottom of the scrolling area: the form is long
            enough that the button used to sit below the fold, and a save
            you have to hunt for reads as a save that is not there. */}
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[#e3e8ef] bg-white px-6 py-3">
          {/* The server's answer sits beside the button that asked. It used
              to render at the end of the scrolling body, under the list of
              stores — pressing "create" and seeing nothing happen is how
              «ما بنشء موظف» was reported. */}
          {error ? (
            <span role="alert" className="me-auto text-[11px] font-medium text-[#fb323f]">
              {error}
            </span>
          ) : (
            !ready && (
              <span className="me-auto text-[11px] text-[#c07f2a]">
                ناقص: {missing.join('، ')}
              </span>
            )
          )}
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} loading={saving} disabled={!ready}>إنشاء الحساب</Button>
        </div>
      </div>
    </Modal>
  );
}
