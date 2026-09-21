'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, ShieldAlert, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { apiJson } from '@/lib/api-client';
import { arDateTime } from '@/lib/format';

/**
 * Where a courier account is entered — and the only place it is.
 *
 * The password goes in and never comes back: the form opens empty even when
 * an account is saved, and the screen is told only that one exists, when it
 * was saved, by whom, and the tail of the login. Showing a stored password
 * back means anyone who reaches this screen has read it.
 */

interface Status {
  providerId: string;
  name: string;
  adapterCode: string;
  apiEnabled: boolean;
  encryptionAvailable: boolean;
  hasCredentials: boolean;
  readable: boolean | null;
  savedAt: string | null;
  savedBy: string | null;
  emailHint: string | null;
  accountCompanyId: number | null;
  senderName: string | null;
  originCityId: number | null;
}

const BLANK = {
  email: '',
  password: '',
  companyId: '',
  originCityId: '',
  senderName: '',
  senderPhone: '',
  senderBusiness: '',
  originAddress: '',
  baseUrl: '',
};

export function CourierCredentials({ providerId }: { providerId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiJson<Status>(`/api/delivery-providers/${providerId}/credentials`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قراءة حالة الحساب');
    }
  }, [providerId]);

  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiJson(`/api/delivery-providers/${providerId}/credentials`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      // The password leaves this browser's memory the moment it is saved.
      setForm({ ...BLANK });
      setOpen(false);
      setDone('حُفظ الحساب مشفَّراً');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      await apiJson(`/api/delivery-providers/${providerId}/credentials`, { method: 'DELETE' });
      setDone('حُذف الحساب — الشركة تعود يدوية');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحذف');
    } finally {
      setSaving(false);
    }
  }

  if (!status) {
    return (
      <p className="flex items-center gap-2 text-xs text-[#697586]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ القراءة…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#121926]">
            <KeyRound className="h-3.5 w-3.5 text-[#b8256e]" />
            حساب {status.name} على {status.adapterCode}
          </p>
          {status.hasCredentials ? (
            <p className="mt-0.5 text-[11px] text-[#697586]">
              محفوظ ومشفَّر
              {status.emailHint && <> · الدخول <span dir="ltr">{status.emailHint}</span></>}
              {status.accountCompanyId !== null && <> · رقم الشركة {status.accountCompanyId}</>}
              {status.savedAt && <> · {arDateTime(status.savedAt)}</>}
              {status.savedBy && <> · {status.savedBy}</>}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-[#697586]">
              لا حساب محفوظ — الشحنات تُنشأ يدوياً حتى تُدخله.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!status.encryptionAvailable}>
            <KeyRound className="h-3.5 w-3.5" /> {status.hasCredentials ? 'تغيير الحساب' : 'إدخال الحساب'}
          </Button>
          {status.hasCredentials && (
            <button
              type="button"
              onClick={clear}
              disabled={saving}
              title="حذف الحساب"
              className="cursor-pointer rounded-lg p-2 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!status.encryptionAvailable && (
        <p className="flex items-start gap-2 rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-2.5 text-[11px] leading-relaxed text-[#c2410c]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          مفتاح التشفير غير مُهيّأ على الخادم. أضف <code dir="ltr">APP_ENCRYPTION_KEY</code> إلى
          ملف <code dir="ltr">.env</code> ثم أعد التشغيل — كلمة المرور لن تُحفظ بلا تشفير.
        </p>
      )}

      {status.hasCredentials && status.readable === false && (
        <p className="flex items-start gap-2 rounded-lg border border-[#fecdd1] bg-[#feecee] p-2.5 text-[11px] leading-relaxed text-[#be123c]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          الحساب محفوظ لكن لا يمكن فكّ تشفيره — غالباً تغيّر مفتاح التشفير. الشحنات
          تُنشأ يدوياً حتى تُدخله من جديد.
        </p>
      )}

      {status.hasCredentials && status.readable && (
        <p className="flex items-center gap-2 text-[11px] text-[#15803d]">
          <ShieldCheck className="h-3.5 w-3.5" /> الحساب سليم — الشحنات تُنشأ آلياً.
        </p>
      )}

      {done && <p className="flex items-center gap-1.5 text-[11px] text-emerald-600"><Check className="h-3.5 w-3.5" />{done}</p>}
      {error && !open && <p className="text-[11px] text-rose-600">{error}</p>}

      <Modal
        isOpen={open}
        onClose={() => { setOpen(false); setForm({ ...BLANK }); setError(null); }}
        title={`حساب ${status.name}`}
        subtitle="يُحفظ مشفَّراً على الخادم، ولا يُعرض مرة أخرى بعد الحفظ"
      >
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="البريد / اسم المستخدم *"
              dir="ltr"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="كلمة المرور *"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <Input
              label="رقم الشركة لديهم (Company ID) *"
              type="number"
              dir="ltr"
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              required
            />
            <Input
              label="رقم مدينة الانطلاق *"
              type="number"
              dir="ltr"
              value={form.originCityId}
              onChange={(e) => setForm({ ...form, originCityId: e.target.value })}
              required
            />
            <Input
              label="اسم المُرسِل *"
              value={form.senderName}
              onChange={(e) => setForm({ ...form, senderName: e.target.value })}
              required
            />
            <Input
              label="هاتف المُرسِل *"
              dir="ltr"
              value={form.senderPhone}
              onChange={(e) => setForm({ ...form, senderPhone: e.target.value })}
              required
            />
            <Input
              label="اسم النشاط"
              value={form.senderBusiness}
              onChange={(e) => setForm({ ...form, senderBusiness: e.target.value })}
            />
            <Input
              label="عنوان الانطلاق"
              value={form.originAddress}
              onChange={(e) => setForm({ ...form, originAddress: e.target.value })}
            />
          </div>

          <Input
            label="رابط الـAPI (اتركه فارغاً للافتراضي)"
            dir="ltr"
            placeholder="https://…"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />

          <p className="rounded-lg bg-[#f8fafc] p-2.5 text-[10.5px] leading-relaxed text-[#697586]">
            الحقول المطلوبة هي ما تطلبه الشركة على كل شحنة — بدون أيٍّ منها تُرفض
            الشحنة عندهم لا عندنا. كلمة المرور تُشفَّر قبل أن تُكتب، ولا يُعيدها أي
            طلب بعد ذلك: لتغييرها تُدخلها من جديد.
          </p>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setForm({ ...BLANK }); }}>
              إلغاء
            </Button>
            <Button type="submit" loading={saving}>
              <ShieldCheck className="h-4 w-4" /> احفظ مشفَّراً
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
