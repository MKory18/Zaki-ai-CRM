'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Loader2, Trash2, AlertTriangle, FileType2, ChevronDown } from 'lucide-react';
import { useConfirm } from '@/components/ui/Confirm';

/**
 * THE SELLER'S OWN TYPEFACES.
 *
 * A font library of twenty is still somebody else's twenty. A brand that
 * bought a typeface should be able to set its own pages in it, and until
 * now the only answer was "pick something close".
 *
 * The part of this that is not an ordinary upload button: it reads the
 * licence out of the font file and shows it. Most Arabic type is licensed
 * for the machine you design on and forbids being served from a website —
 * Boutros, BigVesta, RAOOF and thmanyah all say exactly that, inside the
 * file. A seller uploading one of those is almost never defying the
 * licence; they have never seen it, because it lives in a binary.
 *
 * So the words appear, in the panel, before they publish. Nothing is
 * blocked — the store is theirs and so is the call. It only means the call
 * is made knowing what the designer wrote, and their answer is stored next
 * to the file with their name on it.
 */

export interface StoreFontRow {
  id: string;
  key: string;
  label: string;
  family: string;
  weight: number;
  italic: boolean;
  format: string;
  sizeBytes: number;
  notice: string | null;
  restricted: boolean;
  attestedAt: string | null;
  /** Built by the server from the row — the client never makes a path. */
  url: string;
}

const WEIGHT_LABEL: Record<number, string> = {
  100: 'رفيع جداً', 200: 'رفيع', 300: 'خفيف', 400: 'عادي', 500: 'متوسط',
  600: 'شبه عريض', 700: 'عريض', 800: 'عريض جداً', 900: 'أسود',
};

export function FontUploader({ onChanged }: { onChanged?: (rows: StoreFontRow[]) => void }) {
  const [rows, setRows] = useState<StoreFontRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stores/fonts');
      const json = await res.json();
      const list: StoreFontRow[] = json.fonts || [];
      setRows(list);
      onChanged?.(list);
    } catch {
      /* an empty list is the right fallback: no font, not a broken panel */
    }
  }, [onChanged]);

  useEffect(() => { void load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;

    // Asked before the bytes leave the machine, and asked every time. An
    // attestation inherited from a previous upload is not an attestation.
    const ok = await confirm({
      title: 'تأكيد الحق في استخدام الخط',
      body:
        'برفع هذا الخط أنت تقرّ أن لديك الحق في استخدامه ونشره على صفحاتك. ' +
        'معظم الخطوط العربية تمنع استضافة ملفاتها على المواقع حتى لو كان تحميلها مجانياً — ' +
        'سنعرض لك نص الترخيص المكتوب داخل الملف بعد الرفع.',
      confirmLabel: 'أقرّ بذلك، ارفع',
      cancelLabel: 'إلغاء',
    });
    if (!ok) return;

    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      Array.from(files).slice(0, 10).forEach((f) => fd.append('files', f));
      fd.append('attested', 'yes');
      const res = await fetch('/api/stores/fonts', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `تعذر الرفع (${res.status})`);
      await load();
      const added: StoreFontRow[] = json.fonts || [];
      const flagged = added.filter((f) => f.restricted);
      setMsg({
        ok: true,
        text: flagged.length
          ? `تم رفع ${added.length} — اقرأ ترخيص ${flagged.length} منها قبل النشر`
          : `تم رفع ${added.length} ملف خط`,
      });
      // A flagged face opens its licence straight away rather than waiting
      // to be clicked: it is the one thing the seller needs to have seen.
      if (flagged[0]) setOpenNotice(flagged[0].id);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الرفع' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(row: StoreFontRow) {
    const ok = await confirm({
      title: 'حذف الخط',
      body: `«${row.label}» ${WEIGHT_LABEL[row.weight] ?? row.weight}. الصفحات التي تستخدمه سترجع للخط الافتراضي.`,
      confirmLabel: 'احذف',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    });
    if (!ok) return;
    await fetch(`/api/stores/fonts/${row.id}`, { method: 'DELETE' });
    await load();
  }

  // Grouped by family, because a seller uploaded "a font" and not five files.
  const families = new Map<string, StoreFontRow[]>();
  for (const r of rows) {
    const list = families.get(r.key) ?? [];
    list.push(r);
    families.set(r.key, list);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-semibold text-[#364152]">خطوطك المرفوعة</label>
        <span className="text-[10px] text-[#9aa4b2]">{rows.length} ملف</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".woff2,.woff,.otf,.ttf,font/woff2,font/woff,font/otf,font/ttf"
        multiple
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#c9d2e0] px-3 py-2.5 text-[11px] font-semibold text-[#364152] transition hover:border-[#b8256e] hover:text-[#b8256e] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? 'جارٍ الرفع…' : 'ارفع خطاً'}
      </button>
      <p className="mt-1 text-[10px] leading-relaxed text-[#9aa4b2]">
        woff2 أو woff أو otf أو ttf. ارفع كل وزن كملف — الاسم والوزن يُقرآن من داخل الملف.
      </p>

      {msg && (
        <p className={`mt-2 text-[11px] font-medium ${msg.ok ? 'text-[#00994d]' : 'text-rose-600'}`}>
          {msg.text}
        </p>
      )}

      {families.size > 0 && (
        <div className="mt-3 space-y-2">
          {[...families.entries()].map(([key, list]) => {
            const head = list[0];
            const restricted = list.some((f) => f.restricted);
            const notice = list.find((f) => f.notice)?.notice || '';
            const open = list.some((f) => f.id === openNotice);
            return (
              <div key={key} className="rounded-lg border border-[#e3e8ef] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* Drawn in itself: the name of a face tells a seller
                        nothing and its letters tell them everything. */}
                    <p
                      className="truncate text-[13px] font-semibold text-[#121926]"
                      style={{ fontFamily: `"${head.family}", system-ui` }}
                    >
                      {head.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#697586]">
                      {list.map((f) => WEIGHT_LABEL[f.weight] ?? f.weight).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {notice && (
                      <button
                        type="button"
                        title="نص الترخيص كما كتبه المصمّم"
                        onClick={() => setOpenNotice(open ? null : head.id)}
                        className="rounded p-1 text-[#697586] hover:bg-[#f8fafc]"
                      >
                        <FileType2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {list.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        title={`حذف وزن ${WEIGHT_LABEL[f.weight] ?? f.weight}`}
                        onClick={() => void remove(f)}
                        className="rounded p-1 text-[#697586] hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                {restricted && (
                  <p className="mt-1.5 flex items-start gap-1 rounded bg-amber-50 p-1.5 text-[10px] leading-relaxed text-amber-800">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    <span>
                      ترخيص هذا الخط يبدو أنه يمنع استضافته على موقع. اقرأ النص وتأكد قبل نشر الصفحة.
                    </span>
                  </p>
                )}

                {notice && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenNotice(open ? null : head.id)}
                      className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[#697586] hover:text-[#364152]"
                    >
                      <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
                      ما كتبه المصمّم داخل الملف
                    </button>
                    {open && (
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[#f8fafc] p-2 text-[10px] leading-relaxed text-[#364152]" dir="auto">
                        {notice}
                      </pre>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
