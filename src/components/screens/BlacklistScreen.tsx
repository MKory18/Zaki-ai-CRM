'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Loader2, Plus, Search, Undo2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

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
      <p className="text-xs text-[#697586] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3">
        الحظر على <b>رقم الهاتف</b> وعلى مستوى الشركة كلها — لأن الرقم هو الهوية، والشخص نفسه هو الشخص
        نفسه في كل متجر. الطلبات القائمة لا تتأثر؛ الحظر يمنع الطلب <b>القادم</b>. وفكّ الحظر يبقي السجل.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 flex flex-wrap gap-3 items-end"
      >
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[#364152] mb-1">بحث</span>
          <div className="relative">
            <Search className="w-4 h-4 text-[#9aa4b2] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="رقم الهاتف، الاسم أو السبب"
              className="w-full h-10 pr-9 pl-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            />
          </div>
        </label>
        <label className="flex items-center gap-2 h-10 text-sm text-[#364152]">
          <input type="checkbox" checked={showReleased} onChange={(e) => setShowReleased(e.target.checked)} />
          أظهر المفكوكين
        </label>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-10 px-4 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> حظر رقم
        </button>
      </form>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-3">{done}</p>}

      {!blocks ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          <Ban className="w-5 h-5 mx-auto mb-2 text-[#9aa4b2]" />
          {activeCount === 0 ? 'لا أرقام محظورة.' : 'لا نتائج مطابقة.'}
        </p>
      ) : (
        <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">الرقم</th>
                <th className="text-right font-medium px-3 py-2">الاسم</th>
                <th className="text-right font-medium px-3 py-2">سجله معنا</th>
                <th className="text-right font-medium px-3 py-2">السبب</th>
                <th className="text-right font-medium px-3 py-2">حظره</th>
                <th className="text-right font-medium px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {rows.map((b) => (
                <tr key={b.id} className={b.active ? undefined : 'text-[#9aa4b2]'}>
                  <td className="px-3 py-2 font-medium text-[#121926]" dir="ltr">{b.phone}</td>
                  <td className="px-3 py-2">{b.name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-[#697586]">
                    {b.customer
                      ? `${b.customer.totalOrders} طلب · ${b.customer.deliveredOrders} مسلّم · ${b.customer.cancelledOrders} ملغى`
                      : 'لا سجل'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {b.reason}
                    {!b.active && b.releaseReason && (
                      <span className="block text-[11px] text-[#00a344] mt-0.5">
                        فُك: {b.releaseReason} — {b.releasedByName ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#697586]">
                    {b.blockedByName ?? '—'}
                    <span className="block text-[11px] text-[#9aa4b2]">
                      {new Date(b.createdAt).toLocaleDateString('ar', { dateStyle: 'short' })}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-left">
                    {b.active ? (
                      <button
                        onClick={() => setReleasing(b)}
                        className="text-xs text-[#00a344] hover:underline inline-flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" /> فك الحظر
                      </button>
                    ) : (
                      <span className="text-xs text-[#9aa4b2]">مفكوك</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <span className="block text-xs font-medium text-[#364152] mb-1">رقم الهاتف</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
            placeholder="0790123456"
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            dir="ltr"
          />
          <span className="block text-[11px] text-[#9aa4b2] mt-1">
            يُطابَق بصيغته المجرّدة، فلا يهم كيف كُتب.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">الاسم (اختياري)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">السبب (إلزامي)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            rows={3}
            placeholder="مثال: رفض الاستلام ٣ مرات متتالية"
            className="w-full p-3 rounded-[8px] border border-[#e3e8ef] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[#fb323f]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[#e3e8ef] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[#fb323f] text-white text-sm font-medium disabled:opacity-50"
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
        <p className="text-sm text-[#364152] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3">
          سبب الحظر الأصلي: <b>{block.reason}</b>
          <span className="block text-xs text-[#9aa4b2] mt-1">
            يبقى السجل بعد فك الحظر — لا يُحذف شيء.
          </span>
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">سبب فك الحظر (إلزامي)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            rows={3}
            placeholder="مثال: تواصل واعتذر والتزم بالاستلام"
            className="w-full p-3 rounded-[8px] border border-[#e3e8ef] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[#fb323f]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[#e3e8ef] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[#00a344] text-white text-sm font-medium disabled:opacity-50"
          >
            فك الحظر
          </button>
        </div>
      </form>
    </Modal>
  );
}
