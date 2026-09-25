'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ListTree, Loader2, Plus, Trash2, Check, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { apiJson } from '@/lib/api-client';
import { MENU_AR, MENU_KEYS, storePageHref, type MenuItem, type MenuKey } from '@/lib/store-menus';

/**
 * THE SHOP'S FIVE MENUS.
 *
 * Each item has a label, a destination and whether it shows — the last so a
 * seller can take a link down for a week without losing what it said and
 * where it pointed.
 *
 * A destination is CHOSEN, not typed, whenever it is one of the shop's own
 * pages: a path typed from memory is a path that breaks, and it breaks
 * silently — the customer sees a dead link, the seller sees nothing. Typing
 * stays available for an outside address.
 *
 * A page that is still a DRAFT can be linked to, and is labelled as such:
 * a seller building the footer before publishing the policies is ordinary,
 * and refusing the link would make them do it in the wrong order.
 */

interface PageOption {
  slug: string;
  title: string;
  isPublished: boolean;
}

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

export function StoreMenusScreen() {
  const [menus, setMenus] = useState<Record<MenuKey, MenuItem[]> | null>(null);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [storeSlug, setStoreSlug] = useState('');
  const [open, setOpen] = useState<MenuKey>('HEADER');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<MenuKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ menus: Record<MenuKey, MenuItem[]>; pages: PageOption[]; storeSlug: string }>(
        '/api/store/menus'
      );
      setMenus(data.menus);
      setPages(data.pages);
      setStoreSlug(data.storeSlug);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function edit(key: MenuKey, items: MenuItem[]) {
    setMenus((m) => (m ? { ...m, [key]: items } : m));
  }

  async function save(key: MenuKey) {
    if (!menus) return;
    setSavingKey(key);
    setMsg(null);
    try {
      await apiJson(`/api/store/menus?key=${key}`, {
        method: 'PUT',
        body: JSON.stringify({ items: menus[key] }),
      });
      setMsg({ ok: true, text: `تم حفظ «${MENU_AR[key].label}»` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setSavingKey(null);
    }
  }

  if (loading || !menus) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--sys-muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const items = menus[open] ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--sys-heading)]">
            <ListTree className="h-5 w-5 text-[var(--sys-primary)]" />
            قوائم المتجر
          </h1>
          <p className="mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
            أين يذهب الزبون من كل صفحة. الوجهة تُختار من صفحات متجرك، أو تُكتب لرابط خارجي.
          </p>
        </div>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
            {msg.ok && <Check className="mb-0.5 ml-1 inline h-3.5 w-3.5" />}
            {msg.text}
          </span>
        )}
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[var(--sys-border)]">
        {MENU_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setOpen(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              open === key ? 'border-[var(--sys-primary)] text-[var(--sys-primary)]' : 'border-transparent text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)]'
            }`}
          >
            {MENU_AR[key].label}
            {(menus[key]?.length ?? 0) > 0 && (
              <span className="rounded-full bg-[var(--sys-surface-strong)] px-1.5 text-[10px] text-[var(--sys-muted-foreground)]">
                {menus[key].length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className={CARD}>
        <p className="mb-3 text-[11px] text-[var(--sys-muted)]">{MENU_AR[open].hint}</p>

        <div className="space-y-2">
          {items.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--sys-border)] p-4 text-center text-xs text-[var(--sys-muted)]">
              لا عناصر في هذه القائمة بعد.
            </p>
          )}

          {items.map((item, i) => {
            const matchedPage = pages.find((p) => storePageHref(storeSlug, p.slug) === item.href);
            return (
              <div key={i} className="space-y-2 rounded-lg border border-[var(--sys-border)] p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-[200px]"
                    placeholder="العنوان الذي يقرأه الزبون"
                    maxLength={60}
                    value={item.label}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...next[i], label: e.target.value };
                      edit(open, next);
                    }}
                  />
                  <Select
                    className="max-w-[220px] text-xs"
                    value={matchedPage ? matchedPage.slug : '__external'}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = {
                        ...next[i],
                        href: e.target.value === '__external' ? '' : storePageHref(storeSlug, e.target.value),
                      };
                      edit(open, next);
                    }}
                  >
                    <option value="__external">رابط خارجي…</option>
                    {pages.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.title}{!p.isPublished && ' (مسوّدة)'}
                      </option>
                    ))}
                  </Select>
                  {!matchedPage && (
                    <Input
                      className="max-w-[240px]"
                      dir="ltr"
                      placeholder="https://…"
                      maxLength={300}
                      value={item.href}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...next[i], href: e.target.value };
                        edit(open, next);
                      }}
                    />
                  )}
                  <div className="ms-auto flex items-center gap-0.5">
                    <button
                      type="button"
                      title={item.visible ? 'يظهر — اضغط للإخفاء' : 'مخفي — اضغط للإظهار'}
                      onClick={() => {
                        const next = [...items];
                        next[i] = { ...next[i], visible: !next[i].visible };
                        edit(open, next);
                      }}
                      className={`rounded-lg p-1.5 hover:bg-[var(--sys-surface-strong)] ${item.visible ? 'text-[var(--sys-success)]' : 'text-[var(--sys-muted)]'}`}
                    >
                      {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...items];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        edit(open, next);
                      }}
                      className="rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)] disabled:opacity-30"
                      aria-label="حرّكه لأعلى"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={i === items.length - 1}
                      onClick={() => {
                        const next = [...items];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        edit(open, next);
                      }}
                      className="rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)] disabled:opacity-30"
                      aria-label="حرّكه لأسفل"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => edit(open, items.filter((_, j) => j !== i))}
                      className="rounded-lg p-1.5 text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/10"
                      aria-label="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {matchedPage && (
                  <p className="text-[10.5px] text-[var(--sys-muted)]" dir="ltr">
                    {item.href}
                    {!matchedPage.isPublished && (
                      <span dir="rtl" className="ms-2 text-[var(--sys-warning)]">
                        — الصفحة مسوّدة، الرابط معطّل حتى تُنشر
                      </span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={items.length >= 30}
            onClick={() => edit(open, [...items, { label: '', href: '', visible: true }])}
          >
            <Plus className="h-3.5 w-3.5" /> أضف عنصراً
          </Button>
          <Button size="sm" disabled={savingKey === open} onClick={() => void save(open)}>
            {savingKey === open && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            احفظ «{MENU_AR[open].label}»
          </Button>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--sys-muted)]">
          الرابط الخارجي يبدأ بـ https. مسار داخلي يبدأ بشرطة مائلة واحدة — شرطتان تعني موقعاً آخر، وهي مرفوضة.
        </p>
      </div>
    </div>
  );
}
