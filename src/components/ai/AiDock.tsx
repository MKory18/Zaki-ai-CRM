'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Loader2, Minus, Trash2 } from 'lucide-react';

/**
 * THE ASSISTANT, WHEREVER YOU ARE.
 *
 * It was a page. Which meant asking "how many orders are still waiting?"
 * cost you the screen you were working on, and the answer arrived somewhere
 * you then had to navigate back from — so the honest thing most people did
 * was not ask.
 *
 * A bubble in the corner instead. It lives in the shell layout, so moving
 * between screens does not unmount it and the conversation is still there
 * when you open it again. It never covers the page: it is a panel at the
 * corner with a real width, and it closes to a bubble.
 *
 * What it can see is decided entirely on the server. This sends a question
 * to /api/ai/chat and that route resolves the company, the store and the
 * user's permissions itself — nothing here widens anything, because a
 * client that could would be a client worth lying to.
 */

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

/** The conversation survives navigation; it does not survive a reload. */
const KEY = 'zaki_ai_dock';

const OPENERS = [
  'كم طلب ينتظر التأكيد؟',
  'كيف كان أمس مقارنة بأول أمس؟',
  'أي منتج يرتجع أكثر من غيره؟',
];

export function AiDock() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore what was being discussed. Session, not local: a question about
  // yesterday's numbers is not a question you want back next week.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setMsgs(JSON.parse(saved));
    } catch {
      /* blocked storage is not a reason to have no assistant */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* ditto */
    }
  }, [msgs]);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ block: 'end' });
      inputRef.current?.focus();
    }
  }, [open, msgs.length]);

  // Escape closes it, because every panel in every app does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(text?: string) {
    const question = (text ?? q).trim();
    if (!question || busy) return;

    const at = new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    setMsgs((m) => [...m, { role: 'user', content: question, at }]);
    setQ('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, period: 'all' }),
      });
      const json = await res.json().catch(() => ({}));
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.ok
            ? json.answer || 'لم يصل جواب.'
            : json.error || 'تعذر الوصول إلى المساعد. تأكد من إعداده في الإعدادات.',
          at: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: 'assistant', content: 'تعذر الاتصال. تحقق من الإنترنت.', at },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="المساعد الذكي"
        aria-label="افتح المساعد الذكي"
        className="fixed bottom-4 start-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sys-heading)] text-[var(--sys-primary-foreground)] shadow-lg transition hover:bg-[var(--sys-heading)] active:scale-95"
      >
        <Bot className="h-5 w-5" />
        {/* A quiet mark that there is something to come back to. */}
        {msgs.length > 0 && (
          <span className="absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--sys-card)] bg-[var(--sys-primary)]" />
        )}
      </button>
    );
  }

  return (
    <div
      dir="rtl"
      // A panel, not an overlay. It has a width and a height and sits in
      // the corner — the CRM behind it stays readable and clickable, which
      // is the whole difference between an assistant and an interruption.
      className="fixed bottom-4 start-4 z-40 flex h-[min(32rem,calc(100vh-2rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-[var(--sys-border)] bg-[var(--sys-heading)] px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-bold text-[var(--sys-primary-foreground)]">
          <Bot className="h-4 w-4" /> المساعد الذكي
        </span>
        <span className="flex items-center gap-0.5">
          {msgs.length > 0 && (
            <button
              type="button"
              onClick={() => setMsgs([])}
              title="ابدأ محادثة جديدة"
              className="rounded-lg p-1 text-[var(--sys-muted)] hover:bg-[var(--sys-card)]/10 hover:text-[var(--sys-primary-foreground)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="تصغير"
            className="rounded-lg p-1 text-[var(--sys-muted)] hover:bg-[var(--sys-card)]/10 hover:text-[var(--sys-primary-foreground)]"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setMsgs([]); setOpen(false); }}
            title="إغلاق ومسح"
            className="rounded-lg p-1 text-[var(--sys-muted)] hover:bg-[var(--sys-card)]/10 hover:text-[var(--sys-primary-foreground)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.length === 0 ? (
          <div className="pt-4 text-center">
            <Bot className="mx-auto h-7 w-7 text-[var(--sys-border-strong)]" />
            <p className="mt-2 text-xs font-semibold text-[var(--sys-foreground)]">اسأل عن أرقامك</p>
            <p className="mx-auto mt-1 max-w-[16rem] text-caption leading-relaxed text-[var(--sys-muted)]">
              يرى بيانات هذا المتجر وحده، وبحدود صلاحياتك.
            </p>
            <div className="mt-3 space-y-1.5">
              {OPENERS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => void ask(o)}
                  className="block w-full rounded-lg border border-[var(--sys-border)] px-2.5 py-1.5 text-caption text-[var(--sys-foreground)] transition hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-caption leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                    : 'bg-[var(--sys-surface-strong)] text-[var(--sys-heading)]'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className={`mt-0.5 text-caption ${m.role === 'user' ? 'text-[var(--sys-primary-foreground)]/60' : 'text-[var(--sys-muted)]'}`}>
                  {m.at}
                </p>
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-end">
            <span className="flex items-center gap-1 rounded-lg bg-[var(--sys-surface-strong)] px-3 py-2 text-caption text-[var(--sys-muted-foreground)]">
              <Loader2 className="h-3 w-3 animate-spin" /> يقرأ أرقامك…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(); }}
        className="flex items-center gap-1.5 border-t border-[var(--sys-border)] p-2"
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اكتب سؤالك…"
          className="flex-1 rounded-lg border border-[var(--sys-border)] px-2.5 py-1.5 text-caption text-[var(--sys-heading)] outline-none focus:border-[var(--sys-primary)]"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sys-heading)] text-[var(--sys-primary-foreground)] transition disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
