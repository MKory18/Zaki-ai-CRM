'use client';

import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ui/Confirm';

/**
 * THE STORE'S LOGO — one place to set it, used everywhere it appears.
 *
 * The storefront header, the store picker and now the waybill all show
 * Store.logo, and until this there was no screen that set it: the field
 * was a URL only an API call could fill. So no store had a logo, and "why
 * does my logo not show on the waybill" had the plainest possible answer.
 *
 * It lives in the store's settings rather than on the waybill or in a
 * theme, because it is the store's, and a second copy anywhere else is a
 * second place for it to be out of date.
 */
export function StoreLogoField({
  storeId,
  logo,
  onChange,
}: {
  storeId: string;
  logo: string | null | undefined;
  onChange: (logo: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/geo/stores/${storeId}/logo`, { method: 'POST', body: form, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر رفع الشعار');
      onChange(data.logo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر رفع الشعار');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'إزالة الشعار؟',
      body: 'يختفي من واجهة المتجر ومن البوالص، ويبقى اسم المتجر وحده.',
      confirmLabel: 'أزل',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geo/stores/${storeId}/logo`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error('تعذر إزالة الشعار');
      onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إزالة الشعار');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e3e8ef] bg-white">
        {logo ? (
          <img src={logo} alt="" className="h-full w-full object-contain" />
        ) : (
          <ImagePlus className="h-5 w-5 text-[#9aa4b2]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#121926]">شعار المتجر</p>
        <p className="text-[10.5px] leading-relaxed text-[#697586]">
          يظهر في واجهة المتجر وعلى البوالص. صورة مربّعة بخلفية فاتحة تُقرأ أوضح على الطابعة الحرارية.
        </p>
        {error && <p className="mt-0.5 text-[11px] text-[#fb323f]">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3e8ef] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#364152] hover:border-[#b8256e] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {logo ? 'تغيير' : 'رفع شعار'}
        </button>
        {logo && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            title="إزالة الشعار"
            className="rounded-lg p-1.5 text-[#697586] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
