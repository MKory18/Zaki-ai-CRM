import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * O7 — THE DOOR ANOTHER SYSTEM CALLS IN THROUGH, AND EVERY WAY IT SAYS NO.
 *
 * A key is not a session. A browser session is a person who signed in,
 * carries a role, and can be stopped by locking their account; this is a
 * string in a header belonging to a program in another building. So the four
 * refusals matter more here than anywhere else in this product, and each one
 * is tested by making it HAPPEN rather than by reading the code:
 *
 *   no token            → 401
 *   unknown / revoked / expired → 401, and the three are INDISTINGUISHABLE
 *   a scope not granted → 403
 *   over the allowance  → 429 with Retry-After
 *
 * THE THIRD ONE IS WHY THIS FILE IS LONG. «Revoked» answering differently
 * from «unknown» tells somebody holding a stolen key that they have the
 * right string and the wrong moment — which is the one fact a 401 must not
 * hand out. It cannot be proved by reading; it is proved by comparing two
 * responses byte for byte.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, rateLimit } = vi.hoisted(() => ({
  db: {
    systemToken: { findUnique: vi.fn(), update: vi.fn() },
  },
  rateLimit: vi.fn(),
}));
vi.mock('../db', () => ({ db }));
vi.mock('../rate-limit', () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }));

import { V1_CODE, V1Fault } from './door';
import {
  REPLIES_SCOPES,
  V1_SCOPES,
  bearerOf,
  hashToken,
  mintToken,
  parseScopes,
  requireSystemToken,
} from './system-token';

/** A request carrying whatever header a case needs. */
const req = (headers: Record<string, string> = {}) =>
  new Request('https://oms.test/api/v1/products', { headers });

/** The row `findUnique` would return for a live, fully-scoped key. */
const liveRow = (over: Record<string, unknown> = {}) => ({
  id: 'tok_1',
  companyId: 'c1',
  system: 'replies',
  scopes: JSON.stringify(REPLIES_SCOPES),
  rateLimitPerMin: 60,
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  lastUsedAt: new Date(),
  ...over,
});

/** The fault a call throws, as a plain object — or null when it did not. */
async function faultOf(fn: () => Promise<unknown>): Promise<V1Fault | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof V1Fault ? e : null;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockReturnValue({ allowed: true, remaining: 59, retryAfterSec: 0 });
  db.systemToken.update.mockResolvedValue({});
});

describe('the token itself', () => {
  it('is 256 bits of CSPRNG behind a version marker, and never the same twice', () => {
    const a = mintToken();
    const b = mintToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.startsWith('zk1_')).toBe(true);
    // base64url of 32 bytes is 43 characters. Anything shorter is a key
    // somebody shortened, and a guessable key is not a key.
    expect(a.token.length - 'zk1_'.length).toBe(43);
    expect(a.token).toMatch(/^zk1_[A-Za-z0-9_-]+$/);
  });

  it('and what is stored is the hash, which cannot be turned back', () => {
    const { token, tokenHash } = mintToken();
    expect(tokenHash).toBe(crypto.createHash('sha256').update(token, 'utf8').digest('hex'));
    // The whole point: the stored value does not contain the token.
    expect(tokenHash).not.toContain(token.slice(4));
    expect(tokenHash).toHaveLength(64);
  });

  it('and the prefix a screen may see is a prefix, not the key', () => {
    const { token, prefix } = mintToken();
    expect(token.startsWith(prefix)).toBe(true);
    // Ten characters, of which four are the fixed marker: six random
    // characters is enough to tell two keys apart and nowhere near enough
    // to guess one.
    expect(prefix).toHaveLength(10);
    expect(prefix.length).toBeLessThan(token.length / 4);
  });
});

describe('reading the header', () => {
  it('accepts the scheme in either case, because RFC 6750 does', () => {
    expect(bearerOf(req({ authorization: 'Bearer abc' }))).toBe('abc');
    expect(bearerOf(req({ authorization: 'bearer abc' }))).toBe('abc');
    expect(bearerOf(req({ authorization: '  Bearer   abc  ' }))).toBe('abc');
  });

  it('and nothing else is a token', () => {
    for (const header of ['abc', 'Basic abc', 'Bearer', 'Bearer a b', '']) {
      expect(bearerOf(req(header ? { authorization: header } : {})), header).toBeNull();
    }
  });

  it('and a key in a query string is not read, ever', async () => {
    /*
     * A query string is logged by every proxy between the caller and here,
     * which is how a key ends up in somebody's access log and stays there.
     * Proved by sending one and getting the «no token» refusal.
     */
    const url = 'https://oms.test/api/v1/products?token=zk1_whatever&access_token=zk1_whatever';
    const fault = await faultOf(() => requireSystemToken(new Request(url), 'products.read'));
    expect(fault?.code).toBe(V1_CODE.TOKEN_MISSING);
    expect(db.systemToken.findUnique).not.toHaveBeenCalled();
  });
});

describe('no token at all', () => {
  it('is 401, and the database is never asked', async () => {
    const fault = await faultOf(() => requireSystemToken(req(), 'products.read'));
    expect(fault?.status).toBe(401);
    expect(fault?.code).toBe(V1_CODE.TOKEN_MISSING);
    // A door that queries before it has anything to query with is a door
    // somebody can make do work for free.
    expect(db.systemToken.findUnique).not.toHaveBeenCalled();
  });
});

describe('a token that is not valid', () => {
  it('is looked up by its HASH, never by the value sent', async () => {
    db.systemToken.findUnique.mockResolvedValue(null);
    await faultOf(() => requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read'));
    const where = db.systemToken.findUnique.mock.calls[0][0].where;
    expect(where).toEqual({ tokenHash: hashToken('zk1_abc') });
    expect(JSON.stringify(where)).not.toContain('zk1_abc');
  });

  it('and the row it reads carries no secret for a caller to leak', async () => {
    db.systemToken.findUnique.mockResolvedValue(null);
    await faultOf(() => requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read'));
    const select = db.systemToken.findUnique.mock.calls[0][0].select;
    expect(select.tokenHash).toBeUndefined();
  });

  it('and unknown, revoked and expired are the SAME refusal', async () => {
    const cases: [string, unknown][] = [
      ['unknown', null],
      ['revoked', liveRow({ revokedAt: new Date(Date.now() - 1000) })],
      ['expired', liveRow({ expiresAt: new Date(Date.now() - 1000) })],
    ];
    const seen: string[] = [];
    for (const [name, row] of cases) {
      db.systemToken.findUnique.mockResolvedValue(row);
      const fault = await faultOf(() =>
        requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read')
      );
      expect(fault?.status, name).toBe(401);
      expect(fault?.code, name).toBe(V1_CODE.TOKEN_INVALID);
      // The DETAILS too: a `details` that said «expired» would be the leak
      // the shared code was chosen to avoid.
      expect(fault?.details, name).toBeNull();
      seen.push(JSON.stringify({ status: fault?.status, code: fault?.code, message: fault?.message, details: fault?.details }));
    }
    expect(new Set(seen).size, 'ثلاثةُ أسبابٍ تُقرأ من الرد — ومعرفةُ السببِ هي الثغرة').toBe(1);
  });

  it('and a token that expires exactly now is expired, not alive', async () => {
    // The boundary is a decision, and the safe direction is «no».
    db.systemToken.findUnique.mockResolvedValue(liveRow({ expiresAt: new Date(Date.now() - 1) }));
    const fault = await faultOf(() =>
      requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read')
    );
    expect(fault?.code).toBe(V1_CODE.TOKEN_INVALID);
  });

  it('and a refused token never has its use recorded', async () => {
    db.systemToken.findUnique.mockResolvedValue(liveRow({ revokedAt: new Date() }));
    await faultOf(() => requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read'));
    expect(db.systemToken.update).not.toHaveBeenCalled();
  });
});

describe('a scope that was not granted', () => {
  it('is 403, and names the capability it wanted', async () => {
    db.systemToken.findUnique.mockResolvedValue(liveRow({ scopes: JSON.stringify(['products.read']) }));
    const fault = await faultOf(() =>
      requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'orders.create')
    );
    expect(fault?.status).toBe(403);
    expect(fault?.code).toBe(V1_CODE.SCOPE_MISSING);
    // The name of a capability is not a secret, and it is the one thing a
    // program on the other side can act on.
    expect(fault?.details).toEqual({ required: 'orders.create' });
  });

  it('and every one of the five is refused independently of the others', async () => {
    for (const scope of V1_SCOPES) {
      const others = V1_SCOPES.filter((s) => s !== scope);
      db.systemToken.findUnique.mockResolvedValue(liveRow({ scopes: JSON.stringify(others) }));
      const fault = await faultOf(() =>
        requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), scope)
      );
      expect(fault?.code, scope).toBe(V1_CODE.SCOPE_MISSING);
    }
  });

  it('and a scope column that will not parse grants NOTHING', async () => {
    /*
     * FAIL CLOSED. The column being read IS the permission, so a broken
     * value must mean «may do nothing» and not «may do anything». The
     * opposite default would turn one bad write into an open door.
     */
    for (const broken of ['not json', '{}', 'null', '["nonsense"]', '', '[1,2,3]']) {
      expect(parseScopes(broken), broken).toEqual([]);
      db.systemToken.findUnique.mockResolvedValue(liveRow({ scopes: broken }));
      const fault = await faultOf(() =>
        requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read')
      );
      expect(fault?.code, broken).toBe(V1_CODE.SCOPE_MISSING);
    }
  });

  it('and a scope this product does not define is dropped rather than honoured', () => {
    expect(parseScopes('["products.read","orders.delete"]')).toEqual(['products.read']);
  });
});

describe('the rate limit', () => {
  it('is the TOKEN’s own allowance, not a number in the code', async () => {
    db.systemToken.findUnique.mockResolvedValue(liveRow({ rateLimitPerMin: 7 }));
    await requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read');
    expect(rateLimit).toHaveBeenCalledWith('v1:tok_1', 7, 60_000);
  });

  it('and the bucket is per token, so one key cannot spend another’s', async () => {
    db.systemToken.findUnique.mockResolvedValue(liveRow({ id: 'tok_2' }));
    await requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read');
    expect(rateLimit.mock.calls[0][0]).toBe('v1:tok_2');
  });

  it('and it is counted only AFTER the key is known', async () => {
    /*
     * The allowance belongs to the token. Counting an unauthenticated call
     * would let a stranger with no key at all exhaust a real one's budget
     * by guessing — a denial of service that needs no credentials.
     */
    await faultOf(() => requireSystemToken(req(), 'products.read'));
    expect(rateLimit).not.toHaveBeenCalled();

    db.systemToken.findUnique.mockResolvedValue(null);
    await faultOf(() => requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read'));
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('and over the allowance is 429 with how long to wait', async () => {
    db.systemToken.findUnique.mockResolvedValue(liveRow());
    rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterSec: 42 });
    const fault = await faultOf(() =>
      requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read')
    );
    expect(fault?.status).toBe(429);
    expect(fault?.code).toBe(V1_CODE.RATE_LIMITED);
    // Without this a caller retries immediately and stays refused.
    expect(fault?.headers['Retry-After']).toBe('42');
  });
});

describe('what an accepted key hands back', () => {
  it('is the company FROM THE TOKEN, which is the whole tenant rule', async () => {
    db.systemToken.findUnique.mockResolvedValue(liveRow({ companyId: 'c_other' }));
    const caller = await requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read');
    expect(caller.companyId).toBe('c_other');
    expect(caller.tokenId).toBe('tok_1');
    expect(caller.system).toBe('replies');
    expect(caller.scopes).toEqual(REPLIES_SCOPES);
  });

  it('and «last used» is written at most once a minute, not once a call', async () => {
    // Sixty writes a minute to record what one write a minute records just
    // as well, on a door rated at sixty calls a minute.
    db.systemToken.findUnique.mockResolvedValue(liveRow({ lastUsedAt: new Date() }));
    await requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read');
    expect(db.systemToken.update).not.toHaveBeenCalled();

    db.systemToken.findUnique.mockResolvedValue(
      liveRow({ lastUsedAt: new Date(Date.now() - 120_000) })
    );
    await requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read');
    expect(db.systemToken.update).toHaveBeenCalledTimes(1);
  });

  it('and a key that works keeps working when that write fails', async () => {
    // A column recording use must not be able to refuse a call.
    db.systemToken.findUnique.mockResolvedValue(liveRow({ lastUsedAt: null }));
    db.systemToken.update.mockRejectedValue(new Error('database gone'));
    await expect(
      requireSystemToken(req({ authorization: 'Bearer zk1_abc' }), 'products.read')
    ).resolves.toMatchObject({ companyId: 'c1' });
  });
});
