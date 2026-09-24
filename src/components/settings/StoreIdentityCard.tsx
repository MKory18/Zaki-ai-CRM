'use client';

import React, { useEffect, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { StoreBrandField } from './StoreBrandField';

/**
 * WHO THE STORE IS — its name, logo, favicon and support phone.
 *
 * Identity, not look: the system reads these too — the waybill prints the
 * logo and the phone, the store picker shows the name and logo — so they
 * live with the store itself in «البلدان والمتاجر», once. The store's pages
 * (the storefront, the landing pages' footer, the browser tab) read them
 * from here; nothing else keeps a copy. The store's look — its theme,
 * sections and pages — lives in the store section.
 */

interface IdentityRow {
  id: string;
  name: string;
  logo?: string | null;
  favicon?: string | null;
  supportPhone?: string | null;
}

export function StoreIdentityCard({ store, onSaved }: { store: IdentityRow; onSaved?: () => void }) {
  const [name, setName] = useState(store.name);
  const [phone, setPhone] = useState(store.supportPhone ?? '');
  const [logo, setLogo] = useState<string | null>(store.logo ?? null);
  const [favicon, setFavicon] = useState<string | null>(store.favicon ?? null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setName(store.name);
    setPhone(store.supportPhone ?? '');
    setLogo(store.logo ?? null);
    setFavicon(store.favicon ?? null);
  }, [store]);

  const changed = name.trim() !== store.name || phone.trim() !== (store.supportPhone ?? '');

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await apiJson(`/api/geo/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), supportPhone: phone.trim() || null }),
      });
      setMsg({ ok: true, text: 'تم الحفظ' });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-[#e3e8ef] bg-white p-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold text-[#121926]">
          <BadgeCheck className="h-4 w-4 text-[#b8256e]" />
          هوية المتجر
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#697586]">
          تُكتب هنا مرة واحدة، وتقرؤها صفحات المتجر والبوالص واختيار المتجر.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[#364152]">
          اسم المتجر
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="mt-1 block h-10 w-full rounded-[8px] border border-[#e3e8ef] bg-white px-3 text-sm focus:border-[#b8256e] focus:outline-none"
          />
        </label>
        <label className="block text-xs font-medium text-[#364152]">
          هاتف الدعم
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
            inputMode="tel"
            maxLength={40}
            placeholder="0999 000 000"
            className="mt-1 block h-10 w-full rounded-[8px] border border-[#e3e8ef] bg-white px-3 text-left text-sm focus:border-[#b8256e] focus:outline-none"
          />
          <span className="mt-1 block text-[10.5px] text-[#9aa4b2]">يظهر للزبون في المتجر وتذييل الصفحات، ويُطبع على البوليصة.</span>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || saving || name.trim().length < 2}
          className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#b8256e] px-4 text-xs font-bold text-white disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          حفظ
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-[#00a651]' : 'text-[#fb323f]'}`}>{msg.text}</span>}
      </div>

      {/* Saved on upload, not with the form: a file is not a field to
          remember to press save for. */}
      <div className="space-y-3 border-t border-[#e3e8ef] pt-3">
        <StoreBrandField storeId={store.id} kind="logo" value={logo} onChange={(v) => { setLogo(v); onSaved?.(); }} />
        <StoreBrandField storeId={store.id} kind="favicon" value={favicon} onChange={(v) => { setFavicon(v); onSaved?.(); }} />
      </div>
    </div>
  );
}
