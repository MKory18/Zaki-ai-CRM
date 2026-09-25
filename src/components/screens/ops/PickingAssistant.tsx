'use client';

import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * THE ROUND, SUGGESTED — beside the list, never instead of it.
 *
 * It is asked on demand rather than on every load: the packer opens this
 * screen forty times a day and forty calls to an outside provider is the
 * company's money spent on a paragraph nobody read.
 *
 * What comes back is a suggested order of work and a note of what is short.
 * The numbers above it are the real ones and stay on screen; if the two ever
 * disagree, the table is right — it is the same function the API counted
 * with, and this is a sentence about it.
 */

interface Answer {
  suggestion: string | null;
  error?: string;
}

export function PickingAssistant() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setFailed(null);
    try {
      setAnswer(await apiJson<Answer>('/api/ai/picking', { method: 'POST' }));
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'تعذر السؤال');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-[#e3e8ef] rounded-[8px] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#697586]">
          اسأل المساعد عن ترتيب الجولة والنواقص. لا يرى اسم زبون ولا عنواناً، ولا يحجز ولا يحرّك مخزوناً.
        </p>
        <button
          onClick={ask}
          disabled={busy}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e] disabled:opacity-60 cursor-pointer"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#b8256e]" />}
          {busy ? 'جارٍ…' : 'رتّب لي الجولة'}
        </button>
      </div>

      {failed && <p className="mt-2 text-sm text-[#fb323f]">{failed}</p>}
      {answer?.error && <p className="mt-2 text-sm text-[#c07f2a]">{answer.error}</p>}
      {answer?.suggestion && (
        <p className="mt-2 pt-2 border-t border-[#e3e8ef] whitespace-pre-wrap text-sm text-[#121926] leading-7">
          {answer.suggestion}
        </p>
      )}
    </section>
  );
}
