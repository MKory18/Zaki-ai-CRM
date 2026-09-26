'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import { BlockBuilder } from '@/components/landing/blocks/BlockBuilder';
import type { LandingSection } from '@/lib/landing-sections';
import type { StoreTheme } from '@/lib/store-theme';
import { RiCheckLine, RiExternalLinkLine, RiLayoutLine, RiLoader4Line, RiRocketLine, RiSaveLine } from '@remixicon/react';

/**
 * THE SHOP'S HOME PAGE.
 *
 * This screen owns no builder of its own: it hands the store's sections to
 * BlockBuilder — the same component, the same block library and the same
 * preview renderer the landing pages use. A second builder would be two sets
 * of blocks to keep in step, and they would drift.
 *
 * SAVE, PREVIEW, PUBLISH ARE THREE SEPARATE ACTS, as the contract asks.
 * Preview is the canvas you are already looking at, drawn by the public
 * renderer. RiSaveLine writes the draft. Publish is the only one a customer feels,
 * so it asks first and says what it is about to change.
 *
 * THE THEME IS NOT EDITED HERE. It belongs to «القوالب», which is where the
 * colours, the fonts, the header and the checkout are set together. The
 * builder can take an onTheme callback; this screen deliberately does not
 * give it one that saves.
 */

interface Payload {
  store: {
    id: string; name: string; slug: string; type: string;
    logo: string | null; supportPhone: string | null;
    storefrontEnabled: boolean; singleProduct: boolean;
    landingPageId: string | null; currency: string;
  };
  theme: StoreTheme;
  draft: LandingSection[];
  live: LandingSection[];
  publishedAt: string | null;
  hasUnpublished: boolean;
}

export function StoreDesignScreen() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const got = await apiJson<Payload>('/api/store/design');
      setData(got);
      setSections(got.draft);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const got = await apiJson<Payload>('/api/store/design', {
        method: 'PUT',
        body: JSON.stringify({ sections }),
      });
      setData(got);
      setMsg({ ok: true, text: 'حُفظت المسوّدة — لم يتغيّر شيء عند الزبون بعد' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const ok = await confirm({
      title: 'نشر الصفحة الرئيسية؟',
      body:
        sections.length === 0
          ? 'المسوّدة فارغة — النشر سيعيد الواجهة إلى قائمة المنتجات العادية.'
          : 'ما تراه الآن سيصبح ما يراه كل زبون يفتح متجرك. المسوّدة المحفوظة هي ما سيُنشر.',
      confirmLabel: 'انشر',
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      // Publish copies the SAVED draft, so save first if the canvas has moved
      // since — otherwise the seller publishes something they cannot see.
      await apiJson('/api/store/design', { method: 'PUT', body: JSON.stringify({ sections }) });
      const got = await apiJson<Payload>('/api/store/design', { method: 'POST' });
      setData(got);
      setMsg({ ok: true, text: 'نُشرت — هذا ما يراه الزبون الآن' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر النشر' });
    } finally {
      setBusy(false);
    }
  }

  const upload = useCallback(async (files: FileList): Promise<string[]> => {
    if (files.length === 0) return [];
    const fd = new FormData();
    Array.from(files).slice(0, 5).forEach((f) => fd.append('files', f));
    const res = await fetch('/api/store/design/image', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: body.error || 'تعذّر رفع الصور' });
      return [];
    }
    return (body.urls as string[]) || [];
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[#697586]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  // A Single Product store's front IS its landing page. Offering a second
  // builder for a home page it does not have would be the duplication the
  // whole section exists to prevent.
  if (data.store.singleProduct) {
    return (
      <div className="space-y-4 p-4 sm:p-6" dir="rtl">
        <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
          <RiLayoutLine className="h-5 w-5 text-[#b8256e]" />
          تصميم الواجهة
        </h1>
        <div className="rounded-lg border border-[#e3e8ef] bg-white p-4">
          <p className="text-sm font-bold text-[#121926]">واجهة هذا المتجر هي صفحة الهبوط المرتبطة به</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[#697586]">
            متجر Single Product لا يملك صفحة رئيسية منفصلة: عنوانه يعرض صفحة الهبوط التي اخترتَها،
            بكل أقسامها وعروضها وبكسلاتها. تُصمَّم من مكانها — لا نبني لك بانية ثانية لنفس الصفحة.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.store.landingPageId ? (
              <a href={`/growth/landing-pages/${data.store.landingPageId}/editor`}>
                <Button size="sm">
                  <RiExternalLinkLine className="icon-mirror h-4 w-4" /> صمّم صفحة الواجهة
                </Button>
              </a>
            ) : (
              <a href="/growth/single-product-stores">
                <Button size="sm">اختر صفحة الواجهة أولاً</Button>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e8ef] bg-white px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-bold text-[#121926]">
            <RiLayoutLine className="h-4 w-4 text-[#b8256e]" />
            الصفحة الرئيسية لـ«{data.store.name}»
          </h1>
          <p className="mt-0.5 text-xs text-[#697586]">
            {data.publishedAt
              ? `آخر نشر: ${new Date(data.publishedAt).toLocaleString('ar-u-nu-latn')}`
              : 'لم تُنشر بعد — متجرك يعرض قائمة المنتجات العادية'}
            {data.hasUnpublished && ' · فيها تغييرات غير منشورة'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {msg && (
            <span className={`text-xs ${msg.ok ? 'text-[#00a651]' : 'text-[#fb323f]'}`}>
              {msg.ok && <RiCheckLine className="mb-0.5 ml-1 inline h-4 w-4" />}
              {msg.text}
            </span>
          )}
          <a href={`/s/${data.store.slug}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <RiExternalLinkLine className="icon-mirror h-4 w-4" /> المنشورة
            </Button>
          </a>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiSaveLine className="h-4 w-4" />} حفظ
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void publish()}>
            <RiRocketLine className="h-4 w-4" /> نشر
          </Button>
        </div>
      </header>

      {!data.store.storefrontEnabled && (
        <p className="border-b border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-2 text-xs text-[#92400e]">
          واجهة هذا المتجر مطفأة — انشر ما شئت، لن يراه أحد حتى تُشغّلها من «البلدان والمتاجر».
        </p>
      )}

      <div className="min-h-0 flex-1">
        {/* The one builder in this system. The preview beside it is drawn by
            the public renderer, so it cannot be wrong in a way that only
            shows up after publishing. */}
        <BlockBuilder
          theme={data.theme}
          sections={sections}
          onSections={setSections}
          // The look belongs to «القوالب», where it is set once for the whole
          // shop. Changes here would be a second owner for the same values.
          onTheme={() => {}}
          onUpload={upload}
          product={null}
          store={{ name: data.store.name, logo: data.store.logo, phone: data.store.supportPhone }}
          currency={data.store.currency}
          offers={[]}
        />
      </div>
    </div>
  );
}
