import { describe, expect, it, vi } from 'vitest';
import { LogesTechsAdapter, logesTechsBase, logesTechsFromCredentials } from './logestechs';

/**
 * «رُحّل 0 · فشل 8 — Failed to parse URL from /ship/request/by-email». The courier settings say «رابط الـAPI (اتركه
 * فارغاً للافتراضي)»; the box left empty was saved as `''`, and `'' ?? DEFAULT` is `''` — so every parcel of the
 * batch, and the city lookup before it, was sent to a bare path. Asserted on THE URL THE REQUEST WAS SENT TO.
 */

const OFFICIAL = 'https://apisv2.logestechs.com/api';

const sentTo = async (baseUrl: string | undefined) => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 5 }] }), { status: 200 }));
  const adapter = new LogesTechsAdapter({
    baseUrl,
    email: 'a@b.c',
    password: 'x',
    companyId: 136,
    sender: { name: 'متجر', phone: '0790000000' },
    origin: { addressLine1: 'Main', cityId: 1 },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  await adapter.findCityId('السويداء');
  return String((fetchImpl.mock.calls[0] as unknown[])[0]);
};

describe('the address every request starts with', () => {
  it('an empty box is the official address — the batch posts', async () => {
    expect(await sentTo('')).toMatch(new RegExp(`^${OFFICIAL.replace(/[.]/g, '\\.')}/addresses/cities\\?search=`));
  });

  it('spaces only, or nothing at all, are the official address too', async () => {
    expect((await sentTo('   ')).startsWith(`${OFFICIAL}/`)).toBe(true);
    expect((await sentTo(undefined)).startsWith(`${OFFICIAL}/`)).toBe(true);
  });

  it('an address typed without https:// is given it; a trailing slash is dropped', () => {
    expect(logesTechsBase('apisv2.logestechs.com/api/')).toBe(OFFICIAL);
    expect(logesTechsBase(' https://staging.logestechs.com/api/ ')).toBe('https://staging.logestechs.com/api');
  });

  it('a stored account with the empty box builds an adapter that reaches the official address', async () => {
    const adapter = logesTechsFromCredentials({
      email: 'a@b.c', password: 'x', companyId: 136, originCityId: 1, senderName: 'متجر', senderPhone: '0790000000', baseUrl: '',
    });
    expect(adapter).not.toBeNull();
    expect(logesTechsBase(adapter!.config.baseUrl)).toBe(OFFICIAL);
  });

  it('NEGATIVE: no request ever leaves as a bare path', async () => {
    for (const typed of ['', ' ', 'javascript:alert(1)', 'ftp://x.y', '://broken']) {
      expect(await sentTo(typed), `typed «${typed}»`).toMatch(/^https?:\/\//);
    }
  });
});
