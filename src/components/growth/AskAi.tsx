'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Cpu, Loader2, Send, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { apiJson } from '@/lib/api-client';

/**
 * ASKING THE AI ABOUT THIS COMPANY.
 *
 * It sits under the rule-based findings rather than replacing them. Those
 * carry their evidence and can be checked; this reads across them and says
 * something a threshold cannot. Both are on one screen so nobody has to
 * decide which one to trust — the numbers are the same numbers.
 *
 * Three things are stated on the face of it, because an answer from an
 * unnamed model over unnamed data is a rumour:
 *
 *   WHICH MODEL is answering, and from which vendor.
 *   WHICH DATA it was given — and the boxes are switchable, so a question
 *   about products is not paid for with the whole team table.
 *   THE HOUSE PROMPT that was prepended, if the company set one.
 */

interface Source {
  id: string;
  label: string;
  detail: string;
}

interface Info {
  provider: string;
  model: string;
  ready: boolean;
  housePrompt: string;
  sources: Source[];
}

export function AskAi() {
  const [info, setInfo] = useState<Info | null>(null);
  const [question, setQuestion] = useState('');
  const [picked, setPicked] = useState<string[]>(['SALES', 'PRODUCTS', 'TEAM']);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await apiJson<Info>('/api/growth/intelligence/ask'));
    } catch {
      setInfo(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!info) return null;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const ask = async () => {
    if (!question.trim() || picked.length === 0) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const d = await apiJson<{ answer: string }>('/api/growth/intelligence/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), sources: picked }),
      });
      setAnswer(d.answer || 'لم يرجع المزوّد إجابة.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحليل');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#e3e8ef] bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#e3e8ef]">
        <Brain className="w-4 h-4 text-[#b8256e]" />
        <h2 className="text-sm font-bold text-[#121926]">اسأل الذكاء عن أرقامك</h2>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] text-[#697586] bg-[#f8fafc] border border-[#e3e8ef] rounded-lg px-2 py-0.5"
          title={info.housePrompt ? `برومبت ثابت: ${info.housePrompt}` : 'لا برومبت ثابت'}
        >
          <Cpu className="w-3 h-3 text-[#9aa4b2]" />
          {info.provider} · <span dir="ltr">{info.model}</span>
        </span>
        <Link
          href="/settings/ai"
          className="ms-auto inline-flex items-center gap-1 text-[11px] text-[#697586] hover:text-[#b8256e]"
        >
          <Settings2 className="w-3.5 h-3.5" />
          غيّر النموذج
        </Link>
      </header>

      <div className="p-4 space-y-3">
        {!info.ready && (
          <p className="text-xs text-[#c07f2a] bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            لم يُضبط مفتاح الذكاء بعد. اختر المزوّد وأدخل المفتاح من{' '}
            <Link href="/settings/ai" className="underline font-semibold">
              إعدادات الذكاء الاصطناعي
            </Link>{' '}
            — هذه الشاشة جاهزة وتعمل فور إدخاله.
          </p>
        )}

        <div>
          <p className="text-[11px] text-[#697586] mb-1.5">ما الذي يُسمح له بقراءته:</p>
          <div className="flex flex-wrap gap-1.5">
            {info.sources.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  title={s.detail}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
                    on
                      ? 'bg-[#fdf5fa] border-[#f2c9dd] text-[#b8256e] font-semibold'
                      : 'bg-white border-[#e3e8ef] text-[#697586] hover:border-[#b8256e]/40'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          ref={box}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/⌘+Enter sends, so a long prompt can still use Enter.
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void ask();
          }}
          rows={3}
          maxLength={2000}
          placeholder="الصق برومبتك هنا، أو اسأل مباشرة — مثلاً: أي منتج أخسره من كثرة الرفض ولماذا؟"
          className="w-full px-2.5 py-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ask}
            disabled={busy || !question.trim() || picked.length === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#b8256e] text-white text-[11px] font-semibold hover:bg-[#a01f60] disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            حلّل
          </button>
          <span className="text-[10px] text-[#9aa4b2]">Ctrl + Enter</span>
          {picked.length === 0 && (
            <span className="text-[11px] text-[#c07f2a]">اختر مصدر بيانات واحداً على الأقل.</span>
          )}
        </div>

        {error && (
          <p className="text-xs text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-lg p-2.5">{error}</p>
        )}

        {answer && (
          <div className="rounded-lg border border-[#e3e8ef] bg-[#f8fafc] p-3">
            <p className="text-xs text-[#364152] whitespace-pre-wrap leading-relaxed">{answer}</p>
            <p className="text-[10px] text-[#9aa4b2] mt-2">
              مبني على أرقام الثلاثين يوماً الماضية المعروضة أعلاه — راجِعه قبل التنفيذ.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
