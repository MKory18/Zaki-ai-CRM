import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveTxt, resolve4, resolveCname } = vi.hoisted(() => ({
  resolveTxt: vi.fn(),
  resolve4: vi.fn(),
  resolveCname: vi.fn(),
}));
vi.mock('node:dns', () => ({ promises: { resolveTxt, resolve4, resolveCname } }));

import {
  checkDomain,
  requiredRecords,
  routingTarget,
  verifyRecordName,
  verifyToken,
} from './domain-verify';

/**
 * «متحقَّق» MEANS SOMEBODY LOOKED.
 *
 * The failure this guards against is a badge that means "the seller pressed
 * a button": it tells them the shop is reachable while every customer gets
 * an error. So VERIFIED requires both halves to be found by a real lookup,
 * and every other case says WHICH half is missing — «فشل» with no reason is
 * a dead end for somebody who has to go and edit DNS.
 */

const saved = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.APP_DOMAIN = 'zaki.app';
  delete process.env.APP_PUBLIC_IP;
  resolveTxt.mockResolvedValue([]);
  resolve4.mockResolvedValue([]);
  resolveCname.mockResolvedValue([]);
});

afterEach(() => {
  process.env = { ...saved };
});

const TOKEN = () => verifyToken('shop.example.com');

describe('the token a domain must publish', () => {
  it('cannot be guessed without the installation’s secret', () => {
    const a = verifyToken('shop.example.com');
    process.env.APP_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(verifyToken('shop.example.com')).not.toBe(a);
  });

  it('is one value per domain, and stable for it', () => {
    expect(verifyToken('shop.example.com')).toBe(verifyToken('shop.example.com'));
    expect(verifyToken('shop.example.com')).not.toBe(verifyToken('other.example.com'));
  });

  it('does not care how the host was typed', () => {
    expect(verifyToken('SHOP.Example.com')).toBe(verifyToken('shop.example.com'));
    expect(verifyToken('shop.example.com:443')).toBe(verifyToken('shop.example.com'));
  });

  it('lives at a name nobody would create by accident', () => {
    expect(verifyRecordName('shop.example.com')).toBe('_zaki-verify.shop.example.com');
  });
});

describe('where the seller is told to point the domain', () => {
  it('prefers a CNAME to the app’s own hostname — it survives the server moving', () => {
    expect(routingTarget()).toEqual({ kind: 'CNAME', value: 'zaki.app' });
  });

  it('falls back to an A record when only an address is configured', () => {
    delete process.env.APP_DOMAIN;
    process.env.APP_PUBLIC_IP = '203.0.113.9';
    expect(routingTarget()).toEqual({ kind: 'A', value: '203.0.113.9' });
  });

  it('says nothing rather than inventing a value that would take the shop off the air', () => {
    delete process.env.APP_DOMAIN;
    delete process.env.APP_PUBLIC_IP;
    expect(routingTarget()).toBeNull();
    // And the records list then carries no routing row at all.
    expect(requiredRecords('shop.example.com').map((r) => r.type)).toEqual(['TXT']);
  });

  it('refuses an APP_PUBLIC_IP that is not an address', () => {
    delete process.env.APP_DOMAIN;
    process.env.APP_PUBLIC_IP = 'not-an-ip';
    expect(routingTarget()).toBeNull();
  });

  it('lists both records to create, TXT included', () => {
    const records = requiredRecords('shop.example.com');
    expect(records.map((r) => r.type)).toEqual(['CNAME', 'TXT']);
    expect(records.find((r) => r.type === 'TXT')!.value).toBe(TOKEN());
  });
});

describe('what a lookup concludes', () => {
  const pass = () => {
    resolveTxt.mockResolvedValue([[TOKEN()]]);
    resolveCname.mockResolvedValue(['zaki.app']);
  };

  it('VERIFIED only when the domain is both owned AND pointed here', async () => {
    pass();
    const result = await checkDomain('shop.example.com');
    expect(result.status).toBe('VERIFIED');
    expect(result.ownership).toBe(true);
    expect(result.routing).toBe(true);
  });

  it('ownership alone is not verified, and says which half is missing', async () => {
    resolveTxt.mockResolvedValue([[TOKEN()]]);
    const result = await checkDomain('shop.example.com');
    expect(result.status).toBe('PENDING');
    expect(result.ownership).toBe(true);
    expect(result.routing).toBe(false);
    expect(result.detail).toContain('zaki.app');
  });

  it('routing alone is not verified either — anyone can point a record at us', async () => {
    resolveCname.mockResolvedValue(['zaki.app']);
    const result = await checkDomain('shop.example.com');
    expect(result.status).toBe('PENDING');
    expect(result.routing).toBe(true);
    expect(result.ownership).toBe(false);
    expect(result.detail).toContain('_zaki-verify.shop.example.com');
  });

  it('a TXT record with somebody else’s token does not count', async () => {
    resolveTxt.mockResolvedValue([['not-the-token'], ['v=spf1 -all']]);
    resolveCname.mockResolvedValue(['zaki.app']);
    expect((await checkDomain('shop.example.com')).ownership).toBe(false);
  });

  it('reads a TXT value split into chunks, which long records are', async () => {
    const token = TOKEN();
    resolveTxt.mockResolvedValue([[token.slice(0, 10), token.slice(10)]]);
    resolveCname.mockResolvedValue(['zaki.app']);
    expect((await checkDomain('shop.example.com')).ownership).toBe(true);
  });

  it('matches an A record when that is what was configured', async () => {
    delete process.env.APP_DOMAIN;
    process.env.APP_PUBLIC_IP = '203.0.113.9';
    resolveTxt.mockResolvedValue([[verifyToken('shop.example.com')]]);
    resolve4.mockResolvedValue(['203.0.113.9']);
    expect((await checkDomain('shop.example.com')).status).toBe('VERIFIED');
  });

  it('a CNAME pointing somewhere else is not routing here', async () => {
    resolveTxt.mockResolvedValue([[TOKEN()]]);
    resolveCname.mockResolvedValue(['someone-else.example']);
    expect((await checkDomain('shop.example.com')).routing).toBe(false);
  });

  it('a DNS failure reads as nothing found, not as an error thrown at the seller', async () => {
    resolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await checkDomain('shop.example.com');
    expect(result.status).toBe('PENDING');
    expect(result.found).toEqual({ txt: [], a: [], cname: [] });
  });

  it('reports the deployment’s own missing configuration as ours, not the seller’s fault', async () => {
    delete process.env.APP_DOMAIN;
    delete process.env.APP_PUBLIC_IP;
    resolveTxt.mockResolvedValue([[TOKEN()]]);
    const result = await checkDomain('shop.example.com');
    expect(result.status).toBe('PENDING');
    expect(result.detail).toContain('APP_DOMAIN');
  });

  it('a host that is not a host FAILS outright', async () => {
    for (const bad of ['', 'localhost', '203.0.113.9']) {
      const result = await checkDomain(bad);
      expect(result.status, bad).toBe('FAILED');
    }
  });

  it('does not reach for TLS before DNS says the domain is ours', async () => {
    // Probing 443 on a domain that is not pointed here costs a timeout on
    // every check and tells nobody anything.
    const result = await checkDomain('shop.example.com');
    expect(result.ssl).toBe('UNKNOWN');
  });

  it('records what it actually found, so the screen can show it', async () => {
    resolveTxt.mockResolvedValue([['some-other-value']]);
    resolveCname.mockResolvedValue(['elsewhere.example']);
    const result = await checkDomain('shop.example.com');
    expect(result.found.txt).toEqual(['some-other-value']);
    expect(result.found.cname).toEqual(['elsewhere.example']);
  });
});
