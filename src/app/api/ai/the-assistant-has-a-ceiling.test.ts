import { describe, expect, it } from 'vitest';

/**
 * ONE PERSON CANNOT EMPTY THE PROVIDER'S ACCOUNT WITH A LOOP.
 *
 * No AI door had a ceiling. Ten a minute per person and per door (three for
 * the landing-page builder and the daily summary, which cost the most); a
 * person working normally never meets it, a script meets it at once.
 */

import { tooManyAiCalls } from '@/lib/ai-rate';

describe('the ceiling', () => {
  it('lets ten through in a minute and answers the eleventh with 429, in Arabic', async () => {
    for (let i = 0; i < 10; i++) expect(tooManyAiCalls('chat', 'c1', 'loop-1')).toBeNull();
    const res = tooManyAiCalls('chat', 'c1', 'loop-1')!;
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('AI_RATE_LIMITED');
    expect(body.errorAr).toMatch(/ثانية/);
  });

  it('is per person: a colleague is not stopped by somebody else’s loop', () => {
    for (let i = 0; i < 11; i++) tooManyAiCalls('chat', 'c1', 'loop-2');
    expect(tooManyAiCalls('chat', 'c1', 'colleague')).toBeNull();
  });

  it('and per door: the bubble’s limit does not close the confirmation assistant', () => {
    for (let i = 0; i < 11; i++) tooManyAiCalls('chat', 'c1', 'loop-3');
    expect(tooManyAiCalls('confirmation', 'c1', 'loop-3')).toBeNull();
  });

  it('the expensive doors stop sooner', () => {
    for (let i = 0; i < 3; i++) expect(tooManyAiCalls('landing-build', 'c1', 'loop-4', 3)).toBeNull();
    expect(tooManyAiCalls('landing-build', 'c1', 'loop-4', 3)?.status).toBe(429);
  });
});
