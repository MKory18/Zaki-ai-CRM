'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { RiAddCircleLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiLoader4Line, RiPencilLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Money } from '@/components/ui/Money';
import { HealthChip } from '@/components/ui/HealthChip';
import { healthOf } from '@/lib/health';
import type { ChannelScore } from '@/lib/channel-score';
import type { Trust } from '@/lib/cod-vitals';

/**
 * /settings/channels — where this shop's orders come from.
 *
 * The order's source was free text, so the same channel arrived spelled
 * three different ways and nothing could be counted per channel. Here they
 * are named once. The platform behind the name is a separate field on
 * purpose: "تيكتوك — صفحة الكريم" and "تيكتوك — صفحة القطرة" are two
 * channels and one platform, and both questions get asked.
 *
 * A channel with orders is never deleted, only switched off: it leaves the
 * lists people pick from and stays in the numbers.
 */

const KIND_AR: Record<string, string> = {
  LANDING_PAGE: 'صفحة هبوط',
  FACEBOOK: 'فيسبوك',
  INSTAGRAM: 'إنستغرام',
  TIKTOK: 'تيكتوك',
  WHATSAPP: 'واتساب',
  TELEGRAM: 'تلجرام',
  PHONE: 'هاتف',
  SHEET: 'شيت',
  WEBSITE: 'الموقع',
  OTHER: 'أخرى',
};

const KIND_TONE: Record<string, string> = {
  LANDING_PAGE: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  FACEBOOK: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  INSTAGRAM: 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)] border-[var(--sys-primary-soft)]',
  TIKTOK: 'bg-[var(--sys-surface-strong)] text-[var(--sys-heading)] border-[var(--sys-border)]',
  WHATSAPP: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success-soft)]',
  TELEGRAM: 'bg-[var(--sys-surface)] text-[var(--sys-primary)] border-[var(--sys-primary-soft)]',
  PHONE: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  SHEET: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]',
  WEBSITE: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  OTHER: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
};

interface Channel {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  sortOrder: number;
  orders: number;
}

/**
 * WHAT EACH DOOR ACTUALLY PRODUCED — from its own endpoint.
 *
 * Kept off `GET /api/settings/channels` on purpose: that call fills the
 * dropdown on every order-intake form and is open to anyone who may enter an
 * order. Numbers belong behind `analytics.view`, and a data-entry form should
 * not wait for a report to load.
 */
interface ChannelPerf {
  id: string;
  name: string;
  kind: string | null;
  isActive: boolean;
  brought: number;
  confirmed: number;
  delivered: number;
  returned: number;
  doorDecided: number;
  collected: number;
  confirmationRate: number | null;
  deliveryRate: number | null;
  returnRate: number | null;
  revenue: number;
  deliveredValue: number | null;
  score: ChannelScore;
  whyNoScore: string | null;
}

interface ShopSpread {
  orders: number;
  delivered: number;
  collected: number;
  withoutChannel: number;
  withoutChannelShare: number | null;
  collection: Trust;
}

const INPUT =
  'w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

export function ChannelsScreen() {
  const toast = useToast();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  // The numbers arrive separately and may be refused outright — a channel
  // editor is useful to somebody without `analytics.view`, and the list must
  // still draw when the report behind it returns 403.
  const [perf, setPerf] = useState<{ channels: ChannelPerf[]; shop: ShopSpread } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', kind: 'LANDING_PAGE' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', kind: 'OTHER' });

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ channels: Channel[] }>('/api/settings/channels');
      setChannels(res.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
    // Its own try: a refused or failed report must not blank the editor.
    try {
      setPerf(await apiJson<{ channels: ChannelPerf[]; shop: ShopSpread }>('/api/settings/channels/performance'));
    } catch {
      setPerf(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (draft.name.trim().length < 2) {
      toast.failed('اكتب اسم القناة');
      return;
    }
    setBusy('new');
    try {
      await apiJson('/api/settings/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), kind: draft.kind }),
      });
      setDraft({ name: '', kind: 'LANDING_PAGE' });
      setAdding(false);
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الإضافة');
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await apiJson(`/api/settings/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEditing(null);
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(null);
    }
  }

  async function remove(channel: Channel) {
    setBusy(channel.id);
    try {
      await apiJson(`/api/settings/channels/${channel.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحذف');
    } finally {
      setBusy(null);
    }
  }

  if (!channels) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const total = channels.reduce((sum, c) => sum + c.orders, 0);

  return (
    // Wider than it was: the editor alone fitted in three columns, and the
    // score section under it does not.
    <div className="max-w-5xl space-y-4">
      <PageHeader title="قنوات الطلبات"
          description="من أين تصل الطلبات — تُختار عند الإدخال وتُحسب عليها الأرقام."
          actions={
            <>{!adding && (
          <button
            onClick={() => { setAdding(true); setError(null); }}
            className="px-3 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <RiAddCircleLine className="w-4 h-4" />
            قناة جديدة
          </button>
        )}</>
          }
        />

      {error && (
        <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>
      )}

      {adding && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">اسم القناة</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                placeholder="مثال: تيكتوك — صفحة كريم الندبات"
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">المنصة</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={INPUT}>
                {Object.entries(KIND_AR).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-[var(--sys-muted)]">
            عدة قنوات قد تشترك بمنصة واحدة — هكذا تعرف كم جاء من تيكتوك كلها، وكم من كل صفحة فيها.
          </p>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy === 'new'}
              className="min-h-11 md:min-h-0 inline-flex items-center px-3 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
            >
              {busy === 'new' ? 'جارٍ الإضافة…' : 'أضف القناة'}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null); }}
              className="min-h-11 md:min-h-0 inline-flex items-center px-3 py-1.5 rounded-lg border border-[var(--sys-border)] text-xs text-[var(--sys-muted-foreground)]"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg divide-y divide-[var(--sys-border)]">
        {channels.length === 0 && (
          <p className="p-6 text-sm text-[var(--sys-muted-foreground)] text-center">لا قنوات بعد — أضف أول واحدة.</p>
        )}

        {channels.map((c) => (
          <div key={c.id} className={`p-3 ${c.isActive ? '' : 'bg-[var(--sys-surface)]'}`}>
            {editing === c.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[180px]">
                  <span className="block text-xs text-[var(--sys-muted-foreground)] mb-1">الاسم</span>
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    autoFocus
                    className={INPUT}
                  />
                </label>
                <label className="w-40">
                  <span className="block text-xs text-[var(--sys-muted-foreground)] mb-1">المنصة</span>
                  <select
                    value={editDraft.kind}
                    onChange={(e) => setEditDraft({ ...editDraft, kind: e.target.value })}
                    className={INPUT}
                  >
                    {Object.entries(KIND_AR).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => patch(c.id, { name: editDraft.name.trim(), kind: editDraft.kind })}
                  aria-label="احفظ التعديل"
                  title="احفظ التعديل"
                  disabled={busy === c.id}
                  className="h-11 md:h-10 px-3 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
                >
                  <RiCheckLine className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditing(null)}
                  aria-label="ألغِ التعديل"
                  title="ألغِ التعديل"
                  className="h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-xs text-[var(--sys-muted-foreground)]"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-md border ${KIND_TONE[c.kind] ?? KIND_TONE.OTHER}`}>
                  {KIND_AR[c.kind] ?? c.kind}
                </span>
                <span className={`text-sm font-medium ${c.isActive ? 'text-[var(--sys-heading)]' : 'text-[var(--sys-muted)] line-through'}`}>
                  {c.name}
                </span>
                <span className="text-xs text-[var(--sys-muted)] tabular-nums">
                  {c.orders} طلب
                  {total > 0 && c.orders > 0 && ` · ${Math.round((c.orders / total) * 100)}%`}
                </span>

                <div className="ms-auto flex items-center gap-1">
                  <button
                    onClick={() => { setEditing(c.id); setEditDraft({ name: c.name, kind: c.kind }); setError(null); }}
                    className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-md text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-surface)]"
                    aria-label="تعديل" title="تعديل"
                  >
                    <RiPencilLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => patch(c.id, { isActive: !c.isActive })}
                    disabled={busy === c.id}
                    className="min-h-11 md:min-h-0 inline-flex items-center text-xs px-2 py-1 rounded-md border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]"
                  >
                    {c.isActive ? 'إيقاف' : 'تفعيل'}
                  </button>
                  {c.orders === 0 && (
                    <button
                      onClick={() => remove(c)}
                      disabled={busy === c.id}
                      className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-md text-[var(--sys-muted)] hover:text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]"
                      aria-label="حذف — لا طلبات عليها" title="حذف — لا طلبات عليها"
                    >
                      <RiDeleteBinLine className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--sys-muted)]">
        القناة التي عليها طلبات لا تُحذف — تُوقَف فتختفي من قوائم الاختيار وتبقى في الإحصاءات.
      </p>

      <ChannelScores perf={perf} />
    </div>
  );
}

/**
 * ─── WHICH DOOR BRINGS MONEY THAT LANDS ───
 *
 * The list above answers «what are my channels called». This answers the
 * question the owner actually asked, which the old screen could not express
 * at all: it printed an order count and a share of the total, so it said
 * الشيت is 87% of the business and never mentioned that 30 of its parcels
 * came back.
 *
 * Every figure here is the server's. Not one rate, share or sum is computed
 * in this component — the score, its bands, the return rate and the money all
 * arrive decided, because a browser that recomputes a displayed figure is how
 * two screens come to disagree about one week.
 */
function ChannelScores({ perf }: { perf: { channels: ChannelPerf[]; shop: ShopSpread } | null }) {
  if (!perf) return null;

  const { shop } = perf;
  // Doors that have ever brought an order. A channel somebody created and
  // never used has nothing to grade and would only pad the section.
  const rows = perf.channels.filter((c) => c.brought > 0);
  const graded = rows.filter((c) => c.score.total !== null);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--sys-heading)]">سكور القنوات — أيّها يوصِّل فعلاً</h2>
        <p className="mt-1 text-xs text-[var(--sys-muted-foreground)]">
          ليس الأكثر طلباً — الأكثر وصولاً. قناة تجلب 100 طلب يرجع منها 40 أسوأ من واحدة تجلب 30 كلها تُسلَّم.
        </p>
      </div>

      {/*
        THE BAND THAT CANNOT BE MEASURED, SAID BEFORE ANY SCORE IS READ.

        The owner asked which channel produces delivered AND COLLECTED money.
        Delivered, this can answer. Collected, it cannot: measured, 0 of 119
        delivered orders have ever been marked settled. Scoring that band
        anyway would give every door the same zero and rank four channels by a
        tie — so it is refused out loud, once, and its 15 points leave every
        score's denominator.
      */}
      {shop.collection.level === 'WITHHELD' && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 text-xs text-[var(--sys-muted-foreground)]">
          <span className="font-semibold text-[var(--sys-heading)]">التحصيل خارج السكور: </span>
          {shop.collection.ar} لذلك يُحسب كل سكور من 85 لا من 100، وبند «نسبة التحصيل» يبقى بلا نقاط حتى تُطابَق أول كشف.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--sys-muted-foreground)]">
          لا طلبات على أيّ قناة بعد — السكور يظهر مع أول طلبات تصل.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--sys-border)]">
          {rows.map((c, i) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {/* The rank is only drawn for a door that has one. Numbering
                    the ungraded ones 5, 6, 7 would read as «worse», and they
                    are not worse — they are unmeasured. */}
                <span className="w-5 text-xs font-black tabular-nums text-[var(--sys-muted)]">
                  {c.score.total === null ? '—' : i + 1}
                </span>
                <span className="text-sm font-bold text-[var(--sys-heading)]">{c.name}</span>
                <span className="text-xs text-[var(--sys-muted)]">{KIND_AR[c.kind ?? 'OTHER'] ?? c.kind}</span>

                {c.score.total === null ? (
                  <span className="ms-auto text-xs text-[var(--sys-muted-foreground)]">{c.whyNoScore}</span>
                ) : (
                  <span className="ms-auto inline-flex items-baseline gap-1 tabular-nums">
                    <span className="text-lg font-black text-[var(--sys-heading)]">{c.score.total}</span>
                    <span className="text-xs text-[var(--sys-muted-foreground)]">من {c.score.possible}</span>
                  </span>
                )}
              </div>

              {/*
                WHAT IT MEASURED, ALWAYS — never the headline alone. Somebody
                told «your channel scored 67» can do nothing with it; somebody
                told which band cost the points can.
              */}
              {c.score.total !== null && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {c.score.bands.map((b) => (
                    <li key={b.key} className="text-xs text-[var(--sys-muted-foreground)]">
                      {b.ar}{' '}
                      <span className="tabular-nums text-[var(--sys-foreground)]">
                        {b.value === null ? 'لم يُقَس' : null}
                        {b.value !== null && b.unit === 'money' ? <Money value={b.value} /> : null}
                        {b.value !== null && b.unit === 'rate' ? `${Math.round(b.value)}%` : null}
                      </span>{' '}
                      <span className="tabular-nums font-semibold text-[var(--sys-heading)]">
                        {b.points === null ? '—' : `${b.points}/${b.weight}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* The plain counts under the bands, so the score can be checked
                  against the orders it was built from. */}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sys-muted)] tabular-nums">
                <span>{c.brought} طلب</span>
                <span>{c.delivered} مسلَّم</span>
                <span>{c.returned} مرتجع من {c.doorDecided} بتَّ فيه الباب</span>
                <span className="text-[var(--sys-foreground)]"><Money value={c.revenue} /> وصلت الباب</span>
                {c.returnRate !== null && (
                  <HealthChip health={healthOf('returnRate', c.returnRate, c.doorDecided)} />
                )}
              </p>
            </li>
          ))}

          {/*
            THE ORDERS THAT CAME THROUGH NO DOOR AT ALL.

            A row, not an omission. Every share above is a share of the shop's
            orders, and a total that quietly excludes fourteen of them makes
            every other row look bigger than it is. It carries no score: «no
            channel» is not a channel, and grading it would invent a door.
          */}
          {shop.withoutChannel > 0 && (
            <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className="w-5" />
              <span className="text-sm font-bold text-[var(--sys-muted-foreground)]">بلا قناة</span>
              <span className="text-xs text-[var(--sys-muted)] tabular-nums">
                {shop.withoutChannel} طلب من {shop.orders}
                {shop.withoutChannelShare !== null ? ` · ${shop.withoutChannelShare}%` : ''}
              </span>
              <span className="ms-auto text-xs text-[var(--sys-muted-foreground)]">
                لا سكور — الطلب لم يُنسب لباب، وهذه نسبة تُسدّ عند الإدخال لا هنا.
              </span>
            </li>
          )}
        </ul>
      )}

      {graded.length > 0 && graded.length < rows.length && (
        <p className="text-xs text-[var(--sys-muted)]">
          {graded.length} من {rows.length} قناة عليها ما يكفي للحكم — البقية تُقاس حين تكبر، لا الآن.
        </p>
      )}
    </div>
  );
}
