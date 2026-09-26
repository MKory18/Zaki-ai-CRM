'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { RiAddCircleLine, RiLoader4Line } from '@remixicon/react';

/**
 * THE SHELF A PRODUCT SITS ON — CHOSEN, OR NAMED ON THE SPOT.
 *
 * Measured before this existed: 114 products, 0 categories, 0 products
 * categorised. Not because nobody bothered — because there was NO WAY to
 * make one. `/api/categories` read them and nothing wrote them, and the
 * product form had no field at all.
 *
 * That emptiness reached further than a blank column. Permissions can be
 * scoped to categories — «this person sees only the skincare line» — and
 * the service enforces it correctly against a list that was always empty.
 * A capability nobody can configure is indistinguishable from a broken
 * one.
 *
 * WHY THERE IS NO «MANAGE CATEGORIES» SCREEN.
 *
 * A category has a name and nothing else. A screen, a menu entry and a
 * route for one text field is how a settings area becomes forty screens
 * nobody can find anything in. It is created where it is first needed —
 * while filing a product — and renamed or removed from the same place.
 * The first category in a business is created by somebody filing the
 * first product, not by somebody planning a taxonomy.
 */
export function CategoryPicker({
  value,
  onChange,
  label = 'التصنيف',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}) {
  const [cats, setCats] = useState<{ id: string; name: string }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ categories: { id: string; name: string }[] }>('/api/categories');
      setCats(d.categories);
    } catch {
      setCats([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const name = draft.trim();
    if (name.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const d = await apiJson<{ category: { id: string; name: string } }>('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await load();
      // Chosen straight away: naming a shelf and then having to find it in
      // a list is two steps for one intention.
      onChange(d.category.id);
      setDraft('');
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]" htmlFor="product-category">
        {label}
      </label>

      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="اسم التصنيف الجديد"
            maxLength={60}
            className="h-11 md:h-10 min-w-0 flex-1 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || draft.trim().length < 2}
            className="h-11 md:h-10 rounded-lg bg-[var(--sys-primary)] px-3 text-sm font-medium text-[var(--sys-primary-foreground)] disabled:opacity-50"
          >
            {busy ? <RiLoader4Line className="h-4 w-4 animate-spin" aria-hidden /> : 'أضف'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="h-11 md:h-10 rounded-lg border border-[var(--sys-border)] px-3 text-sm text-[var(--sys-muted-foreground)]"
          >
            إلغاء
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="product-category"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="h-11 md:h-10 min-w-0 flex-1 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-sm"
          >
            <option value="">بلا تصنيف</option>
            {(cats ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-11 items-center gap-1 rounded-lg border border-[var(--sys-border)] px-3 text-sm text-[var(--sys-primary)] md:h-10"
          >
            <RiAddCircleLine className="h-4 w-4" aria-hidden />
            جديد
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-[var(--sys-destructive)]">{error}</p>}

      {/* Said once, where the decision is. Not a warning — an explanation
          of what the field is for, which is the thing nobody could guess
          while it did not exist. */}
      {cats !== null && cats.length === 0 && !adding && (
        <p className="mt-1 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          لا تصنيفات بعد. التصنيفُ يجمع المنتجات في التقارير، وبه تُحصر صلاحيةُ موظّفٍ على خطٍّ
          واحد من منتجاتك.
        </p>
      )}
    </div>
  );
}
