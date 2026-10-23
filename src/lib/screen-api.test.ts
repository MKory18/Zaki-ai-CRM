import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screenApi, qs } from './screen-api';

/**
 * WHAT A REFUSAL SAYS WHEN IT REACHES A SCREEN THAT USES `screenApi`.
 *
 * Every route answers a refusal through `apiErrorResponse` as
 * `{ error, errorAr }` — the English for logs, the Arabic for the person.
 * `screenApi` read only `error`, so WhatsApp, Telegram and the product offers
 * showed the generic «حدث خطأ غير متوقع» where `apiJson` screens showed the
 * server's own sentence. Put `data.error` first again and the first test reads
 * the English string.
 *
 * It also has NO timeout on purpose (the landing editor's AI-copy call is
 * allowed 60 seconds; `apiJson` would abort it at 15) — asserted below so the
 * «tidy up, use apiJson» idea cannot slip in unnoticed.
 */

const answer = (status: number, body: unknown) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));

beforeEach(() => {
  vi.stubGlobal('fetch', answer(200, {}));
});
afterEach(() => vi.unstubAllGlobals());

describe('screenApi — the sentence a person reads', () => {
  it('is the Arabic one when the server sent both', async () => {
    vi.stubGlobal('fetch', answer(403, { error: 'Forbidden', errorAr: 'ليس لديك صلاحية' }));
    await expect(screenApi('/api/x')).rejects.toThrow('ليس لديك صلاحية');
  });

  it('falls back to `error` when there is no Arabic one', async () => {
    vi.stubGlobal('fetch', answer(400, { error: 'اسم مطلوب' }));
    await expect(screenApi('/api/x')).rejects.toThrow('اسم مطلوب');
  });

  it('and to the generic sentence only when the body says nothing — the negative case', async () => {
    vi.stubGlobal('fetch', answer(500, {}));
    await expect(screenApi('/api/x')).rejects.toThrow('حدث خطأ غير متوقع');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } })));
    await expect(screenApi('/api/x')).rejects.toThrow('حدث خطأ غير متوقع');
  });
});

describe('screenApi — what it sends and what it does not', () => {
  it('sends JSON by default, same-origin, and lets the caller override', async () => {
    const f = answer(200, { ok: true });
    vi.stubGlobal('fetch', f);
    expect(await screenApi('/api/x', { method: 'POST', body: '{}' })).toEqual({ ok: true });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('has NO timeout signal of its own — the 60-second AI-copy call depends on it', async () => {
    const f = answer(200, {});
    vi.stubGlobal('fetch', f);
    await screenApi('/api/ai/landing-copy', { method: 'POST', body: '{}' });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal, 'screenApi صار له مهلة — انكسر توليد النص بالذكاء').toBeUndefined();
  });
});

describe('qs', () => {
  it('drops empty, null, undefined and «all», and keeps the rest', () => {
    expect(qs({ a: 1, b: '', c: null, d: undefined, e: 'all', f: 'x y' })).toBe('?a=1&f=x+y');
    expect(qs({})).toBe('');
  });
});
