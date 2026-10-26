import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

/**
 * A CEILING ON HOW FAST ONE PERSON CAN SPEND THE PROVIDER'S CREDIT.
 *
 * No AI door had one. A loop over «ابنيلي صفحة الهبوط» (a 1.5 MB picture
 * each time) or over «اسأل الذكاء» empties a paid account in hours, and a
 * loop over the daily summary recounts the whole history on every press.
 * Per person and per door, in a minute window — the same in-memory buckets
 * the command palette's «لخّصلي اليوم» already uses. A person working
 * normally never meets it; a script does at once.
 */
export function tooManyAiCalls(door: string, companyId: string, userId: string, perMinute = 10): NextResponse | null {
  const rl = rateLimit(`ai:${door}:${companyId}:${userId}`, perMinute, 60_000);
  if (rl.allowed) return null;
  const msg = `طلبات كثيرة على المساعد. أعد المحاولة بعد ${rl.retryAfterSec} ثانية.`;
  return NextResponse.json({ error: msg, errorAr: msg, code: 'AI_RATE_LIMITED' }, { status: 429 });
}
