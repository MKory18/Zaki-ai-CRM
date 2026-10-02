'use client';

import { useMemo, useState } from 'react';
import { AD_FRAMEWORKS, VISITOR_TEMPERATURES, type LandingStructure } from '@/lib/landing-structure';
import { SECTION_LABEL } from '@/lib/landing-sections';

/**
 * THE TEN PERSUASION STRUCTURES, FOR SOMEBODY ABOUT TO BUILD A PAGE.
 *
 * It shows the STORY, because that is what a structure is. A card drawn in
 * the structure's colours would be showing the skin, which is the other
 * half and chosen separately — so there is not one colour on these cards
 * that comes from a structure, and there is none to come.
 *
 * WHAT A SELLER IS ACTUALLY CHOOSING BETWEEN is the order of the beats: a
 * page that opens on the problem and one that opens on the price are two
 * different pages for two different visitors. So the sequence is drawn as
 * the sequence, in the library's own words, with the ad it answers and the
 * visitor it was written for beside it.
 *
 * THE FILTERS NARROW AND DO NOTHING ELSE. «فلتر البنى حسب إطار الإعلان
 * وحرارة الزائر — للتصفح فقط»: no structure is refused to a product, and
 * nothing here is recorded.
 */

const FRAMEWORK_LABEL: Record<string, string> = {
  problemSolution: 'المشكلة ثم الحل',
  usVsThem: 'نحن مقابل البدائل',
  ugc: 'بصوت الزبون',
  // Distinct from the structure's own name «الاكتشاف»: this labels the AD's
  // angle, not the page, and two controls reading identically is one
  // control a seller cannot tell apart.
  theHack: 'اكتشاف طريقة أبسط',
  mechanism: 'شرح الآلية',
  transformation: 'التغيّر مع الوقت',
  offerFirst: 'العرض المحدود',
  quiz: 'اعرف ما يناسبك',
  origin: 'قصة الأصل',
  objections: 'الإجابة على الشك',
};

const TEMPERATURE_LABEL: Record<string, string> = {
  cold: 'بارد',
  warm: 'دافئ',
  hot: 'ساخن',
  hesitant: 'متردّد',
};

const LENGTH_LABEL: Record<string, string> = {
  short: 'قصيرة',
  medium: 'متوسطة',
  long: 'طويلة',
};

/** The furniture every structure carries; it says nothing about the story. */
const FURNITURE = new Set(['sticky', 'footer']);

export function StructureGallery({
  structures,
  value,
  onChange,
  productName,
}: {
  structures: readonly LandingStructure[];
  value: string | null;
  onChange: (id: string) => void;
  /** Drawn into the first beat, so the seller reads their own product. */
  productName?: string;
}) {
  const [framework, setFramework] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      structures.filter(
        (s) =>
          (!framework || s.adFramework === framework) &&
          (!temperature || s.temperature === temperature)
      ),
    [structures, framework, temperature]
  );

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-bold ${
      on
        ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
        : 'border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
    }`;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--sys-muted)]">إطار الإعلان</span>
          <button type="button" onClick={() => setFramework(null)} aria-pressed={!framework} className={chip(!framework)}>
            الكل
          </button>
          {AD_FRAMEWORKS.filter((f) => structures.some((s) => s.adFramework === f)).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFramework(f === framework ? null : f)}
              aria-pressed={framework === f}
              className={chip(framework === f)}
            >
              {FRAMEWORK_LABEL[f] ?? f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--sys-muted)]">حرارة الزائر</span>
          <button type="button" onClick={() => setTemperature(null)} aria-pressed={!temperature} className={chip(!temperature)}>
            الكل
          </button>
          {VISITOR_TEMPERATURES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTemperature(t === temperature ? null : t)}
              aria-pressed={temperature === t}
              className={chip(temperature === t)}
            >
              {TEMPERATURE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="rounded-lg border border-[var(--sys-border)] p-3 text-xs text-[var(--sys-muted-foreground)]">
          لا بنية بهذين الوصفين. الفلتر للتصفّح فقط — امسحه وستظهر العشر كلّها.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((s) => {
          const picked = s.id === value;
          const beats = s.sequence.filter((t) => !FURNITURE.has(t));
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              aria-pressed={picked}
              className={`rounded-lg border p-3 text-start ${
                picked
                  ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/5'
                  : 'border-[var(--sys-border)] hover:border-[var(--sys-primary)]'
              }`}
            >
              <p className="text-sm font-bold text-[var(--sys-heading)]">{s.name}</p>
              <p className="mt-0.5 text-xs text-[var(--sys-muted-foreground)]">{s.forWhom}</p>

              {/*
                THE STORY, AS AN ORDER. The first beat carries the seller's
                own product name, so the question «هل يناسب هذا منتجي؟» can
                be answered by reading rather than by imagining.
              */}
              <ol className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                {beats.map((t, i) => (
                  <li key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[var(--sys-muted)]">←</span>}
                    <span className="rounded border border-[var(--sys-border)] px-1.5 py-0.5 text-[var(--sys-muted-foreground)]">
                      {i === 0 && productName ? productName : SECTION_LABEL[t]}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-2 text-xs text-[var(--sys-muted)]">
                {FRAMEWORK_LABEL[s.adFramework] ?? s.adFramework} · زائر {TEMPERATURE_LABEL[s.temperature]} ·{' '}
                {LENGTH_LABEL[s.length]} · {s.slots.length} خانة نص
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
