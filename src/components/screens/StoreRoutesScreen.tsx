'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useConfirm } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import { RiAddCircleLine, RiCheckLine, RiDeleteBinLine, RiLoader4Line, RiShutDownLine, RiSparkling2Line } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * OLD ADDRESSES THAT STILL ARRIVE.
 *
 * The screen leads with the SUGGESTIONS, because a suggestion nobody has
 * looked at is an advertisement still landing on a 404 — the clicks are
 * already paid for. Each says what changed and offers the two answers: yes,
 * forward it; or no, the old address should stop working.
 *
 * 301 versus 302 is explained where it is chosen, not in a manual. A 301 is
 * cached hard by browsers and search engines, so a wrong one is close to
 * unrecoverable on the machines that took it.
 */

interface RedirectRow {
  id: string;
  from: string;
  to: string;
  kind: 301 | 302;
  hits: number;
  isActive: boolean;
  suggested: boolean;
}

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3';

export function StoreRoutesScreen() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<RedirectRow[]>([]);
  const [adding, setAdding] = useState<{ from: string; to: string; kind: 301 | 302 } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ redirects: RedirectRow[] }>('/api/store/redirects');
      setRows(data.redirects);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(fn: () => Promise<unknown>, okText?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التنفيذ' });
    } finally {
      setBusy(false);
    }
  }

  const accept = (row: RedirectRow) =>
    call(
      () => apiJson(`/api/store/redirects/${row.id}`, { method: 'PATCH', body: JSON.stringify({ accept: true }) }),
      'صار التحويل يعمل'
    );

  const toggle = (row: RedirectRow) =>
    call(() =>
      apiJson(`/api/store/redirects/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.isActive }),
      })
    );

  async function dismiss(row: RedirectRow) {
    const ok = await confirm({
      title: row.suggested ? 'تجاهل هذا الاقتراح؟' : `حذف التحويل من ${row.from}؟`,
      body: row.suggested
        ? 'العنوان القديم سيبقى يعطي «غير موجود» لكل من يفتحه — وهذا هو المطلوب إن كنت غيّرت الرابط لتهرب من حملة.'
        : 'كل من يفتح العنوان القديم سيحصل على «غير موجود» بدل أن يُحوَّل.',
      tone: 'danger',
      confirmLabel: row.suggested ? 'تجاهل' : 'احذف',
    });
    if (!ok) return;
    await call(() => apiJson(`/api/store/redirects/${row.id}`, { method: 'DELETE' }));
  }

  const add = () =>
    adding &&
    call(async () => {
      await apiJson('/api/store/redirects', { method: 'POST', body: JSON.stringify(adding) });
      setAdding(null);
    }, 'أُضيف التحويل');

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const suggestions = rows.filter((r) => r.suggested);
  const live = rows.filter((r) => !r.suggested);

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="المسارات"
          description="عنوان قديم ما زال يأتيك منه زوّار — إلى أين تُرسلهم."
        />
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
              {msg.ok && <RiCheckLine className="mb-0.5 ml-1 inline h-4 w-4" />}
              {msg.text}
            </span>
          )}
          <Button size="sm" disabled={busy || !!adding} onClick={() => setAdding({ from: '/lp/', to: '/lp/', kind: 302 })}>
            <RiAddCircleLine className="h-4 w-4" /> تحويل جديد
          </Button>
        </div>
      </header>

      {/* The decision that is costing money while it waits. */}
      {suggestions.length > 0 && (
        <section className="space-y-2 rounded-lg border border-[var(--sys-warning)]/40 bg-[var(--sys-warning)]/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--sys-warning)]">
            <RiSparkling2Line className="h-4 w-4" />
            {suggestions.length === 1 ? 'اقتراح ينتظر قرارك' : `${suggestions.length} اقتراحات تنتظر قرارك`}
          </p>
          <p className="text-xs leading-relaxed text-[var(--sys-warning)]">
            غيّرتَ رابط صفحة، والإعلان ما زال يشير إلى القديم. كل نقرة عليه مدفوعة سلفاً وتصل الآن إلى
            «غير موجود». حوّلها، أو تجاهل الاقتراح إن كنت تريد للعنوان القديم أن يتوقف.
          </p>
          {suggestions.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--sys-card)] p-2.5">
              <code className="text-xs text-[var(--sys-muted-foreground)]" dir="ltr">{row.from}</code>
              <span className="text-[var(--sys-muted)]">←</span>
              <code className="text-xs font-semibold text-[var(--sys-heading)]" dir="ltr">{row.to}</code>
              <div className="ms-auto flex items-center gap-1.5">
                <Button size="sm" disabled={busy} onClick={() => void accept(row)}>حوّلها</Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void dismiss(row)}>تجاهل</Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {adding && (
        <div className={CARD}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">من (المسار القديم)</span>
              <Input dir="ltr" maxLength={200} value={adding.from} onChange={(e) => setAdding({ ...adding, from: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">إلى</span>
              <Input dir="ltr" maxLength={300} value={adding.to} onChange={(e) => setAdding({ ...adding, to: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">النوع</span>
              <Select
                value={String(adding.kind)}
                onChange={(e) => setAdding({ ...adding, kind: Number(e.target.value) === 301 ? 301 : 302 })}
              >
                <option value="302">302 — مؤقّت</option>
                <option value="301">301 — دائم</option>
              </Select>
            </label>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--sys-muted)]">
            302 مؤقّت ويمكن الرجوع عنه في أي وقت. 301 دائم، وتحفظه المتصفحات ومحرّكات البحث مدّة طويلة —
            فالخطأ فيه يصعب التراجع عنه على الأجهزة التي حفظته. ابدأ بـ302 إن لم تكن واثقاً.
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAdding(null)}>إلغاء</Button>
            <Button size="sm" disabled={busy} onClick={() => void add()}>أضف</Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
                <Rows
          rows={live}
          keyOf={(row) => row.id}
          columns={[
            { key: 'c0', label: "من", primary: true,
              render: (row) => (
                  <><code className="text-xs">{row.from}</code></>
                ) },
            { key: 'c1', label: "إلى", primary: true,
              render: (row) => (
                  <><code className="text-xs">{row.to}</code></>
                ) },
            { key: 'c2', label: "النوع", align: 'end',
              render: (row) => (row.kind) },
            { key: 'c3', label: "الزيارات", align: 'end',
              render: (row) => (row.hits.toLocaleString('ar-u-nu-latn')) },
            { key: 'c4', label: "الحالة",
              render: (row) => (
                  <><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    row.isActive ? 'bg-[var(--sys-success)]/10 text-[var(--sys-success)]' : 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]'
                  }`}>
                    {row.isActive ? 'يعمل' : 'موقوف'}
                  </span></>
                ) },
            { key: 'c5', label: "إجراءات",
              render: (row) => (
                  <><div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggle(row)}
                      title={row.isActive ? 'أوقفه' : 'شغّله'}
                      className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-foreground)] hover:bg-[var(--sys-surface-strong)] disabled:opacity-40"
                    >
                      <RiShutDownLine className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void dismiss(row)}
                      aria-label="حذف" title="حذف"
                      className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/10 disabled:opacity-40"
                    >
                      <RiDeleteBinLine className="h-4 w-4" />
                    </button>
                  </div></>
                ) },
          ]}
          empty={
            <EmptyState
              title="لا مساراتٍ مُحوَّلة"
              why="التحويل يُبقي رابطاً قديماً يعمل بعد تغيير المسار. أضِف واحداً حين تُغيّر عنوان صفحة."
            />
          }
        />
      </div>
      <p className="text-xs text-[var(--sys-muted)]">
        عدد الزيارات تقديري: يُحتسب بعد إرسال الزائر، فلا ينتظر أحد على عدّاد.
      </p>
    </div>
  );
}
