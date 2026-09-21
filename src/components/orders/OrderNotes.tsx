'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * It sits directly under the journey and is built to the same rhythm: the
 * same card, the same heading, the same 11px body and 10px byline, so the
 * two read as one story — what happened, then what was said about it.
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

/** One colour per author, picked from their name so it never moves. */
const TONES = [
  'bg-[#fdf5fa] text-[#b8256e]',
  'bg-[#eef4ff] text-[#2563eb]',
  'bg-[#ecfdf5] text-[#047857]',
  'bg-[#fff7ed] text-[#c2410c]',
  'bg-[#f5f3ff] text-[#6d28d9]',
];
function toneFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return TONES[sum % TONES.length];
}
const initials = (name: string) => name.trim().charAt(0) || '؟';

export function OrderNotes({ orderId }: { orderId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

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
      box.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إضافة الملاحظة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquareText className="w-4 h-4 text-[#b8256e]" />
        <h4 className="text-xs font-black text-slate-700">ملاحظات داخلية</h4>
        {notes && notes.length > 0 && (
          <span className="text-[10px] font-medium text-[#9aa4b2] tabular-nums">{notes.length}</span>
        )}
      </div>

      {notes === null ? (
        <p className="text-[11px] text-[#9aa4b2] flex items-center gap-1.5 py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> جارٍ التحميل…
        </p>
      ) : notes.length === 0 ? (
        <p className="text-[11px] text-[#9aa4b2] py-2">لا ملاحظات بعد — اكتب أول واحدة.</p>
      ) : (
        <ol className="space-y-2.5">
          {notes.map((note) => {
            const who = note.authorName ?? 'النظام';
            return (
              <li key={note.id} className="flex gap-2.5">
                <span
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${toneFor(who)}`}
                  aria-hidden="true"
                >
                  {initials(who)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[#121926] whitespace-pre-line break-words leading-relaxed">
                    {note.body}
                  </p>
                  <p className="text-[10px] text-[#9aa4b2] mt-0.5 flex flex-wrap gap-x-1.5">
                    <span className="font-medium text-[#697586]">{who}</span>
                    <span>· {arDateShort(note.createdAt)}</span>
                    {note.kind !== 'internal' && <span>· {KIND_AR[note.kind] ?? note.kind}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {error && <p className="text-[11px] text-[#fb323f] mt-2">{error}</p>}

      <div className="mt-4 pt-3 border-t border-[#e3e8ef]">
        <div className="flex items-end gap-2">
          <textarea
            ref={box}
            rows={1}
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
            className="flex-1 min-h-9 max-h-32 px-3 py-2 rounded-[8px] border border-[#e3e8ef] text-[11px] resize-y focus:outline-none focus:border-[#b8256e]"
          />
          <button
            onClick={send}
            disabled={busy || draft.trim().length < 2}
            className="h-9 w-9 rounded-[8px] bg-[#b8256e] text-white disabled:opacity-30 flex items-center justify-center shrink-0"
            title="أضف الملاحظة (Enter)"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-[#9aa4b2] mt-1.5">
          تُضاف ولا تُعدَّل — تبقى كما كُتبت وباسم كاتبها.
        </p>
      </div>
    </div>
  );
}
