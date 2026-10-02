'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiJson } from '@/lib/api-client';
import { routeLabel } from '@/lib/route-registry';
import type { Synonym } from '@/lib/store-search';
import { FIELD_KINDS, type AttributeField, type FieldKind } from '@/lib/product-attributes';
import { RiAddLine, RiDeleteBinLine, RiInformationLine, RiLoader4Line } from '@remixicon/react';

/**
 * HOW A SHOPPER FINDS THE THING THEY CAME FOR.
 *
 * Two halves of one job, so one screen. The shop's own words, and the
 * questions each category is described by — the first feeds the search box
 * and the second feeds the filters, and a seller thinking about either is
 * thinking about the same thing.
 *
 * THE SPELLING IS ALREADY HANDLED, AND THE SCREEN SAYS SO. «اذن» already
 * finds «الأُذُن» without anybody writing a pair for it; a seller who did
 * not know that would fill this list with spelling variants and learn
 * nothing from the ones that changed no results.
 *
 * AND ONLY THE CATEGORIES THIS SHOP'S PRODUCTS CARRY are offered. The
 * table is company-wide; showing all of it would invite a seller to
 * describe another shop's shelves.
 */

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

const KIND_LABEL: Record<FieldKind, string> = {
  select: 'اختيار واحد',
  multi: 'اختيار متعدّد',
  number: 'رقم',
  text: 'نصّ (يُعرض ويُبحَث، ولا يُصفّى به)',
};

interface CategoryRow {
  id: string;
  name: string;
  fields: AttributeField[];
}

export function StoreSearchScreen() {
  const [synonyms, setSynonyms] = useState<Synonym[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [maxSynonyms, setMaxSynonyms] = useState(60);
  const [maxFields, setMaxFields] = useState(12);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{
        synonyms: Synonym[];
        maxSynonyms: number;
        maxFields: number;
        categories: CategoryRow[];
      }>('/api/store/search');
      setSynonyms(data.synonyms);
      setCategories(data.categories);
      setMaxSynonyms(data.maxSynonyms);
      setMaxFields(data.maxFields);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiJson('/api/store/search', {
        method: 'PUT',
        body: JSON.stringify({
          // Blank rows are the ones a seller opened and walked away from.
          synonyms: synonyms.filter((s) => s.from.trim() && s.to.trim()),
          categories: Object.fromEntries(categories.map((c) => [c.id, c.fields])),
        }),
      });
      setMsg({ ok: true, text: 'تم الحفظ' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  const setField = (categoryId: string, index: number, patch: Partial<AttributeField>) =>
    setCategories((rows) =>
      rows.map((c) =>
        c.id === categoryId
          ? { ...c, fields: c.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) }
          : c
      )
    );

  if (loading) {
    return (
      <div className="p-6 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="inline h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={routeLabel('/store/search')}
        actions={
          <Button onClick={save} disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
        }
      />

      {msg && (
        <p
          className={`text-sm font-medium ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-danger)]'}`}
          role="status"
        >
          {msg.text}
        </p>
      )}

      {/* ── The shop's own words ── */}
      <section className={`${CARD} space-y-4`}>
        <div>
          <h2 className="text-sm font-bold text-[var(--sys-heading)]">كلمات المتجر</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            <RiInformationLine className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              كلمتان يعاملهما متجرك على أنهما الشيء نفسه — مثل «طنين» و«صفير الأذن». يعمل
              الاتجاهان معاً، فمن يكتب أيّاً منهما يجد الآخر.
              <br />
              <b>لا تحتاج كتابة اختلافات الإملاء:</b> «اذن» تجد «الأُذُن» أصلاً، والهمزات
              والتشكيل والتاء المربوطة كلّها موحّدة قبل البحث.
            </span>
          </p>
        </div>

        <div className="space-y-2">
          {synonyms.map((s, i) => (
            <div key={i} className="flex items-end gap-2">
              <Input
                label={i === 0 ? 'الكلمة' : undefined}
                value={s.from}
                onChange={(e) =>
                  setSynonyms((rows) => rows.map((r, j) => (j === i ? { ...r, from: e.target.value } : r)))
                }
              />
              <span className="pb-2.5 text-[var(--sys-muted-foreground)]">↔</span>
              <Input
                label={i === 0 ? 'وتعني أيضاً' : undefined}
                value={s.to}
                onChange={(e) =>
                  setSynonyms((rows) => rows.map((r, j) => (j === i ? { ...r, to: e.target.value } : r)))
                }
              />
              <Button
                variant="secondary"
                size="sm"
                aria-label={`حذف الزوج ${i + 1}`}
                onClick={() => setSynonyms((rows) => rows.filter((_, j) => j !== i))}
              >
                <RiDeleteBinLine className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {synonyms.length === 0 && (
            <p className="text-xs text-[var(--sys-muted-foreground)]">لا كلمات بعد.</p>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={synonyms.length >= maxSynonyms}
          onClick={() => setSynonyms((rows) => [...rows, { from: '', to: '' }])}
        >
          <RiAddLine className="h-4 w-4" /> أضف زوجاً
        </Button>
      </section>

      {/* ── The questions each kind of thing is described by ── */}
      <section className={`${CARD} space-y-4`}>
        <div>
          <h2 className="text-sm font-bold text-[var(--sys-heading)]">خصائص كل فئة</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            <RiInformationLine className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              الأسئلة التي يُوصَف بها كل صنف — «مناسب لـ» و«المكوّنات» لدواء، و«المقاس»
              و«الخامة» لقميص. تُجاب على صفحة المنتج، وتصير فلاتر في المتجر.
              <br />
              <b>الفلتر يعرض الخيارات التي تحملها منتجاتك فعلاً</b>، لا كل ما كُتب هنا: خيارٌ
              لا منتجَ يحمله طريقٌ مسدود.
            </span>
          </p>
        </div>

        {categories.length === 0 && (
          <p className="text-xs text-[var(--sys-muted-foreground)]">
            لا فئات بعد — أسنِد فئةً إلى منتج وستظهر هنا.
          </p>
        )}

        {categories.map((c) => (
          <div key={c.id} className="space-y-3 rounded-lg border border-[var(--sys-border)] p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--sys-heading)]">{c.name}</h3>
              <Button
                variant="secondary"
                size="sm"
                disabled={c.fields.length >= maxFields}
                onClick={() =>
                  setCategories((rows) =>
                    rows.map((r) =>
                      r.id === c.id
                        ? {
                            ...r,
                            fields: [
                              ...r.fields,
                              { key: `field_${r.fields.length + 1}`, label: '', kind: 'select', options: [], unit: '' },
                            ],
                          }
                        : r
                    )
                  )
                }
              >
                <RiAddLine className="h-4 w-4" /> أضف حقلاً
              </Button>
            </div>

            {c.fields.length === 0 && (
              <p className="text-xs text-[var(--sys-muted-foreground)]">لا حقول لهذه الفئة.</p>
            )}

            {c.fields.map((f, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
                <Input
                  label="الاسم الظاهر"
                  value={f.label}
                  onChange={(e) => setField(c.id, i, { label: e.target.value })}
                />
                <Select
                  label="النوع"
                  value={f.kind}
                  onChange={(e) => setField(c.id, i, { kind: e.target.value as FieldKind })}
                >
                  {FIELD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                {f.kind === 'number' ? (
                  <Input
                    label="الوحدة"
                    placeholder="مل · غم · سم"
                    value={f.unit}
                    onChange={(e) => setField(c.id, i, { unit: e.target.value })}
                  />
                ) : f.kind === 'text' ? (
                  <p className="self-end pb-2.5 text-xs text-[var(--sys-muted-foreground)]">
                    نصّ حرّ — لا خيارات، ولا يُصفّى به.
                  </p>
                ) : (
                  <Input
                    label="الخيارات، مفصولة بفاصلة"
                    value={f.options.join('، ')}
                    onChange={(e) =>
                      setField(c.id, i, {
                        options: (e.target.value as string)
                          .split(/[،,]/)
                          .map((o) => o.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`حذف حقل ${f.label || i + 1}`}
                  onClick={() =>
                    setCategories((rows) =>
                      rows.map((r) => (r.id === c.id ? { ...r, fields: r.fields.filter((_, j) => j !== i) } : r))
                    )
                  }
                >
                  <RiDeleteBinLine className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
