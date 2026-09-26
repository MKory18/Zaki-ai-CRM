'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiAddCircleLine, RiArrowGoBackLine, RiForbidLine, RiLoader4Line, RiSearchLine } from '@remixicon/react';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * /control/blacklist — who may not order again.
 *
 * Keyed on the phone and company-wide, because the phone is the identity and
 * the same person is the same person in every store. The list shows what
 * each blocked number actually did — orders, delivered, cancelled — so the
 * decision can be judged rather than taken on faith.
 *
 * Releasing keeps the row. Nothing here is deleted.
 */

interface Block {
  id: string;
  phone: string;
  name: string | null;
  reason: string;
  createdAt: string;
  blockedByName: string | null;
  releasedAt: string | null;
  releasedByName: string | null;
  releaseReason: string | null;
  active: boolean;
  customer: { totalOrders: number; deliveredOrders: number; cancelledOrders: number } | null;
}

export function BlacklistScreen() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [releasing, setReleasing] = useState<Block | null>(null);
  const [showReleased, setShowReleased] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = term.trim() ? `?q=${encodeURIComponent(term.trim())}` : '';
      const data = await apiJson<{ blocks: Block[]; activeCount: number }>(`/api/control/blacklist${q}`);
      setBlocks(data.blocks);
      setActiveCount(data.activeCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [term]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = (blocks ?? []).filter((b) => (showReleased ? true : b.active));

  return (
    <div className="max-w-5xl space-y-3">
      <ScreenTitle />

      <p className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
        الحظر على <b>رقم الهاتف</b> وعلى مستوى الشركة كلها — لأن الرقم هو الهوية، والشخص نفسه هو الشخص
        نفسه في كل متجر. الطلبات القائمة لا تتأثر؛ الحظر يمنع الطلب <b>القادم</b>. وفكّ الحظر يبقي السجل.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">بحث</span>
          <div className="relative">
            <RiSearchLine className="w-4 h-4 text-[var(--sys-muted)] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="رقم الهاتف، الاسم أو السبب"
              className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--sys-border)] text-sm"
            />
          </div>
        </label>
        <label className="flex items-center gap-2 h-10 text-sm text-[var(--sys-foreground)]">
          <input type="checkbox" checked={showReleased} onChange={(e) => setShowReleased(e.target.checked)} />
          أظهر المفكوكين
        </label>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium inline-flex items-center gap-1.5"
        >
          <RiAddCircleLine className="w-4 h-4" /> حظر رقم
        </button>
      </form>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

      {!blocks ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
          <RiForbidLine className="w-5 h-5 mx-auto mb-2 text-[var(--sys-muted)]" />
          {activeCount === 0 ? 'لا أرقام محظورة.' : 'لا نتائج مطابقة.'}
        </p>
      ) : (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
                    <Rows
            rows={rows}
            keyOf={(b) => b.id}
            columns={[
              { key: 'c0', label: "الرقم", primary: true,
                render: (b) => (b.phone) },
              { key: 'c1', label: "الاسم", primary: true,
                render: (b) => (b.name ?? '—') },
              { key: 'c2', label: "سجله معنا", align: 'end',
                render: (b) => (
                  <>{b.customer
                      ? `${b.customer.totalOrders} طلب · ${b.customer.deliveredOrders} مسلّم · ${b.customer.cancelledOrders} ملغى`
                      : 'لا سجل'}</>
                ) },
              { key: 'c3', label: "السبب",
                render: (b) => (
                  <>{b.reason}
                    {!b.active && b.releaseReason && (
                      <span className="block text-xs text-[var(--sys-success)] mt-0.5">
                        فُك: {b.releaseReason} — {b.releasedByName ?? '—'}
                      </span>
                    )}</>
                ) },
              { key: 'c4', label: "حظره",
                render: (b) => (
                  <>{b.blockedByName ?? '—'}
                    <span className="block text-xs text-[var(--sys-muted)]">
                      {new Date(b.createdAt).toLocaleDateString('ar-u-nu-latn', { dateStyle: 'short' })}
                    </span></>
                ) },
            ]}
            empty={
              <EmptyState
                title="لا أرقامَ محظورة"
                why="الحظر على الهاتف لا على الاسم: مَن رفض الاستلام ثلاث مرّات يطلب من جديد باسمٍ آخر. أضِف رقماً حين يلزم."
              />
            }
            actions={(b) => (
              <>{b.active ? (
                      <button
                        onClick={() => setReleasing(b)}
                        className="text-xs text-[var(--sys-success)] hover:underline inline-flex items-center gap-1"
                      >
                        <RiArrowGoBackLine className="icon-mirror w-4 h-4" /> فك الحظر
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--sys-muted)]">مفكوك</span>
                    )}</>
            )}
          />
        </div>
      )}

      {adding && (
        <BlockDialog
          onClose={() => setAdding(false)}
          onSaved={async (message) => {
            setAdding(false);
            setDone(message);
            await load();
          }}
        />
      )}

      {releasing && (
        <ReleaseDialog
          block={releasing}
          onClose={() => setReleasing(null)}
          onSaved={async (message) => {
            setReleasing(null);
            setDone(message);
            await load();
          }}
        />
      )}
    </div>
  );
}

function BlockDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title="حظر رقم">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/control/blacklist', {
              method: 'POST',
              body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined, reason: reason.trim() }),
            });
            onSaved(`حُظر الرقم ${phone.trim()}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحظر');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">رقم الهاتف</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
            placeholder="0790123456"
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
          <span className="block text-xs text-[var(--sys-muted)] mt-1">
            يُطابَق بصيغته المجرّدة، فلا يهم كيف كُتب.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الاسم (اختياري)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">السبب (إلزامي)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            rows={3}
            placeholder="مثال: رفض الاستلام 3 مرات متتالية"
            className="w-full p-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الحظر…' : 'حظر'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReleaseDialog({
  block,
  onClose,
  onSaved,
}: {
  block: Block;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title={`فك الحظر — ${block.phone}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/control/blacklist', {
              method: 'PATCH',
              body: JSON.stringify({ blockId: block.id, reason: reason.trim() }),
            });
            onSaved(`فُك الحظر عن ${block.phone}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر فك الحظر');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="text-sm text-[var(--sys-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
          سبب الحظر الأصلي: <b>{block.reason}</b>
          <span className="block text-xs text-[var(--sys-muted)] mt-1">
            يبقى السجل بعد فك الحظر — لا يُحذف شيء.
          </span>
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">سبب فك الحظر (إلزامي)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            rows={3}
            placeholder="مثال: تواصل واعتذر والتزم بالاستلام"
            className="w-full p-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            فك الحظر
          </button>
        </div>
      </form>
    </Modal>
  );
}
