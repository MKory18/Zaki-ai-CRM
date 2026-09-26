'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useConfirm } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import { PAGE_KIND_AR, REQUIRED_FOR_ADS, type PageKind } from '@/lib/store-pages';
import { RiAddCircleLine, RiCheckLine, RiDeleteBinLine, RiExternalLinkLine, RiFileTextLine, RiLoader4Line, RiShieldFlashLine } from '@remixicon/react';

/**
 * THE SHOP'S OWN PAGES.
 *
 * The three an advertising review asks for are created with every store, as
 * drafts. This screen's first job is to say — in words, not as a warning
 * triangle — which of them are still unpublished, because that is the thing
 * that stops a campaign and the thing nobody finds out until it does.
 */

interface PageRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  kind: PageKind;
  isPublished: boolean;
  sortOrder: number;
}

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';
const LABEL = 'mb-1.5 block text-xs font-medium text-[var(--sys-heading)]';

export function StorePagesScreen() {
  const confirm = useConfirm();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [storeSlug, setStoreSlug] = useState('');
  const [missing, setMissing] = useState<PageKind[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PageRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ pages: PageRow[]; storeSlug: string; missingForAds: PageKind[] }>('/api/store/pages');
      setPages(data.pages);
      setStoreSlug(data.storeSlug);
      setMissing(data.missingForAds);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function open(page: PageRow) {
    setOpenId(page.id);
    setDraft({ ...page });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiJson(`/api/store/pages/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title,
          slug: draft.slug,
          body: draft.body,
          isPublished: draft.isPublished,
        }),
      });
      setOpenId(null);
      setDraft(null);
      setMsg({ ok: true, text: 'تم الحفظ' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    setSaving(true);
    setMsg(null);
    try {
      // The first address nothing already holds. `page-${count + 1}` looked
      // fine until a page was deleted or renamed: the count then pointed at
      // a slug that already existed, the save was refused, and every retry
      // was refused the same way — the seller could not add a page at all
      // without renaming an old one by hand.
      const taken = new Set(pages.map((p) => p.slug));
      let n = pages.length + 1;
      while (taken.has(`page-${n}`)) n += 1;
      const { page } = await apiJson<{ page: PageRow }>('/api/store/pages', {
        method: 'POST',
        body: JSON.stringify({ slug: `page-${n}`, title: 'صفحة جديدة', body: '', sortOrder: (pages.length + 1) * 10 }),
      });
      await load();
      open(page);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّرت الإضافة' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(page: PageRow) {
    const ok = await confirm({
      title: `حذف «${page.title}»؟`,
      body: 'الصفحة ورابطها يختفيان من المتجر. أي رابط يشير إليها من قائمة أو تذييل سيصبح معطّلاً.',
      tone: 'danger',
      confirmLabel: 'احذف',
    });
    if (!ok) return;
    try {
      await apiJson(`/api/store/pages/${page.id}`, { method: 'DELETE' });
      if (openId === page.id) { setOpenId(null); setDraft(null); }
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحذف' });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--sys-heading)]">
            <RiFileTextLine className="h-5 w-5 text-[var(--sys-primary)]" />
            صفحات المتجر
          </h1>
          <p className="mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
            كلام المتجر عن نفسه: من نحن، الشروط، الخصوصية، الاستبدال، تواصل معنا.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
              {msg.ok && <RiCheckLine className="mb-0.5 ml-1 inline h-4 w-4" />}
              {msg.text}
            </span>
          )}
          <Button size="sm" onClick={() => void add()} disabled={saving}>
            <RiAddCircleLine className="h-4 w-4" /> صفحة جديدة
          </Button>
        </div>
      </header>

      {/* The thing that stops a campaign, said in words. */}
      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--sys-warning)]/40 bg-[var(--sys-warning)]/10 p-3">
          <RiShieldFlashLine className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sys-warning)]" />
          <div className="text-xs leading-relaxed text-[var(--sys-warning)]">
            <p className="font-bold">
              {missing.length === REQUIRED_FOR_ADS.length
                ? 'لم تُنشر بعد أيٌّ من الصفحات التي تطلبها مراجعة الإعلانات.'
                : 'صفحات تطلبها مراجعة الإعلانات ما زالت مسوّدة:'}
            </p>
            <p className="mt-0.5">
              {missing.map((k) => PAGE_KIND_AR[k]).join(' · ')} — أُنشئت لك بنصّ مبدئي فيه اسم متجرك.
              اقرأها وعدّلها لتطابق ما تفعله فعلاً، ثم انشرها. بدونها قد تُرفض حملتك على فيسبوك وتيكتوك.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {pages.map((page) => (
          <div key={page.id} className={CARD}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-[var(--sys-heading)]">{page.title}</span>
              <span className="rounded-full bg-[var(--sys-surface-strong)] px-2 py-0.5 text-xs text-[var(--sys-muted-foreground)]">
                {PAGE_KIND_AR[page.kind]}
              </span>
              {page.isPublished ? (
                <span className="rounded-full bg-[var(--sys-success)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--sys-success)]">
                  منشورة
                </span>
              ) : (
                <span className="rounded-full bg-[var(--sys-warning)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--sys-warning)]">
                  مسوّدة
                </span>
              )}
              <span className="text-xs text-[var(--sys-muted)]" dir="ltr">/s/{storeSlug}/pages/{page.slug}</span>
              <div className="ms-auto flex items-center gap-1">
                {page.isPublished && (
                  <a
                    href={`/s/${storeSlug}/pages/${page.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-1.5 text-[var(--sys-foreground)] hover:bg-[var(--sys-surface-strong)]"
                    title="افتحها كما يراها الزبون"
                  >
                    <RiExternalLinkLine className="icon-mirror h-4 w-4" />
                  </a>
                )}
                <Button variant="secondary" size="sm" onClick={() => (openId === page.id ? setOpenId(null) : open(page))}>
                  {openId === page.id ? 'إغلاق' : 'تحرير'}
                </Button>
                {!REQUIRED_FOR_ADS.includes(page.kind) && (
                  <button
                    type="button"
                    onClick={() => void remove(page)}
                    className="rounded-lg p-1.5 text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/10"
                    title="حذف"
                  >
                    <RiDeleteBinLine className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {openId === page.id && draft && (
              <div className="mt-3 space-y-3 border-t border-[var(--sys-border)] pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>العنوان</span>
                    <Input
                      maxLength={120}
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>الرابط (slug)</span>
                    <Input
                      dir="ltr"
                      maxLength={40}
                      value={draft.slug}
                      onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                      helperText="أحرف إنجليزية صغيرة وأرقام وشرطات"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className={LABEL}>النصّ</span>
                  <textarea
                    rows={14}
                    maxLength={20000}
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    className="w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 py-2 text-sm leading-7 focus:border-[var(--sys-primary)] focus:outline-none"
                  />
                  <span className="mt-1 block text-xs text-[var(--sys-muted)]">
                    نصّ فقط — سطر فارغ يفصل فقرة عن فقرة. لا وسوم ولا سكربتات: صفحة كلام، لا صفحة تصميم.
                  </span>
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--sys-foreground)]">
                    <input
                      type="checkbox"
                      checked={draft.isPublished}
                      onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
                      className="h-4 w-4 accent-[var(--sys-primary)]"
                    />
                    منشورة — يراها الزبون
                  </label>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setOpenId(null); setDraft(null); }}>
                      إلغاء
                    </Button>
                    <Button size="sm" disabled={saving} onClick={() => void save()}>
                      {saving && <RiLoader4Line className="h-4 w-4 animate-spin" />} حفظ
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
