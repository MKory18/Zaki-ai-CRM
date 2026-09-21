'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquareText, Send, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { arDateShort } from '@/lib/format';

/**
 * The conversation about an order, between the people working it.
 *
 * Internal notes used to be one text box inside the order-data form: saving
 * it overwrote whatever the last person wrote, so the field only ever held
 * the most recent thought and the reasoning behind a decision disappeared
 * the moment somebody else edited the order.
 *
 * They are appended now, each with its author and its moment, and nothing
 * here edits or deletes. A note is what somebody said at a time — the point
 * of keeping it is that it stays said.
 */

interface Note {
  id: string;
  body: string;
  kind: string;
  createdAt: string;
  authorName: string | null;
}

const KIND_AR: Record<string, string> = {
  internal: 'داخلية',
  follow_up: 'متابعة',
  return: 'مرتجع',
  settlement: 'تسوية',
};

export function OrderNotes({ orderId }: { orderId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ notes: Note[] }>(`/api/orders/${orderId}/notes`);
      setNotes(res.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الملاحظات');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (body.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, kind: 'internal' }),
      });
      setDraft('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إضافة الملاحظة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
      <h4 className="text-xs font-black text-slate-700 flex items-center gap-2">
        <MessageSquareText className="w-4 h-4 text-[#b8256e]" />
        ملاحظات داخلية
        {notes && notes.length > 0 && (
          <span className="text-[10px] font-medium text-[#9aa4b2]">({notes.length})</span>
        )}
      </h4>

      {notes === null ? (
        <p className="text-xs text-[#9aa4b2] flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> جارٍ التحميل…
        </p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-[#9aa4b2]">لا ملاحظات بعد — اكتب أول واحدة.</p>
      ) : (
        <ol className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] px-3 py-2">
              <p className="text-xs text-[#121926] whitespace-pre-line break-words">{note.body}</p>
              <p className="text-[10px] text-[#9aa4b2] mt-1 flex flex-wrap gap-x-1.5">
                <span>{note.authorName ?? 'النظام'}</span>
                <span>· {arDateShort(note.createdAt)}</span>
                {note.kind !== 'internal' && <span>· {KIND_AR[note.kind] ?? note.kind}</span>}
              </p>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="text-[11px] text-[#fb323f]">{error}</p>}

      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="اكتب ملاحظة لمن يكمل هذا الطلب…"
          className="flex-1 px-3 py-2 rounded-[8px] border border-[#e3e8ef] text-sm resize-none focus:outline-none focus:border-[#b8256e]"
        />
        <button
          onClick={send}
          disabled={busy || draft.trim().length < 2}
          className="h-9 px-3 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          أضف
        </button>
      </div>

      <p className="text-[10px] text-[#9aa4b2]">الملاحظة تُضاف ولا تُعدَّل — تبقى كما كُتبت وباسم كاتبها.</p>
    </div>
  );
}
