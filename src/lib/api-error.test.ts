import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { apiError, apiErrorResponse } from './api-error';

/**
 * WHAT THE OUTSIDE IS ALLOWED TO LEARN WHEN SOMETHING GOES WRONG.
 *
 * This mapper is the last thing between a thrown error and a browser, and
 * two of its branches repeat the error's own words. That is exactly right
 * for a sentence this codebase wrote for a person to read, and exactly
 * wrong for anything else that happens to contain the same word.
 */

describe('the mappings that carry meaning', () => {
  it('keeps the four that callers depend on', () => {
    expect(apiError(new Error('Unauthorized')).status).toBe(401);
    expect(apiError(new Error('ACCOUNT_SUSPENDED')).status).toBe(401);
    expect(apiError(new Error('Forbidden: missing customers.view')).status).toBe(403);

    const ctx = Object.assign(new Error('اختر دولة'), { name: 'ContextError', code: 'NO_COUNTRY' });
    const mapped = apiError(ctx);
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe('NO_COUNTRY');
  });

  it('turns the two Prisma codes it knows into their own answers', () => {
    const dup = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '6' });
    expect(apiError(dup)).toMatchObject({ status: 409, body: { code: 'DUPLICATE' } });

    const gone = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '6' });
    expect(apiError(gone)).toMatchObject({ status: 409, body: { code: 'NOT_FOUND' } });
  });

  /**
   * The two words are English, so only the English sentences the guards
   * throw take these branches. An Arabic «غير موجودة» has always fallen
   * through to a 500 with the generic body — recorded here because it
   * looks like an oversight until you see it written down, and because
   * widening the match to Arabic would widen what gets echoed.
   */
  it('still shows a sentence written here for a person to read', () => {
    expect(apiError(new Error('Wallet not found'))).toMatchObject({
      status: 404,
      body: { error: 'Wallet not found' },
    });
    expect(apiError(new Error('Version conflict: the order moved'))).toMatchObject({ status: 409 });
    expect(apiError(new Error('المحفظة غير موجودة')).status, 'العربيّةُ لا تطابق الكلمتين').toBe(500);
  });
});

/**
 * MEASURED, NOT FEARED.
 *
 * Every message below was mapped and returned WHOLE before this guard —
 * absolute source paths, the Prisma model and method, the engine file and
 * the client version, at 404 and 409, in production.
 */
describe('what must never reach a browser', () => {
  const leaks: [string, Error][] = [
    [
      'the source tree and the query',
      Object.assign(
        new Error(
          'Invalid `prisma.order.findUnique()` invocation in\nC:\\Users\\LOQ\\Documents\\osm\\src\\lib\\orders.ts:88:14\n\nThe required record was not found.'
        ),
        { name: 'PrismaClientKnownRequestError' }
      ),
    ],
    [
      'the engine file and the Prisma version',
      Object.assign(
        new Error('Prisma Client could not locate the Query engine.\nPrisma Client version: 6.19.3'),
        { name: 'PrismaClientInitializationError' }
      ),
    ],
    [
      // Prisma's own wording for P2025, and the case that needs the class
      // check on its own: short, one line, no path, and it would sail
      // through every other test in this guard.
      'the model and the operation, in a tidy sentence',
      Object.assign(new Error('Record to update not found.'), { name: 'PrismaClientKnownRequestError' }),
    ],
    ['a path on its own, one line', new Error('config not found at /var/app/secrets/keys.json')],
    ['a windows path', new Error('version file not found: C:\\Users\\LOQ\\secrets.txt')],
  ];

  for (const [what, error] of leaks) {
    it(`hides ${what}`, () => {
      const out = apiError(error);
      expect(out.status, what).toBe(500);
      expect(out.body.error, what).toBe('حدث خطأ داخلي');
    });
  }

  it('hides a message too long to have been written for a person', () => {
    const wall = `not found: ${'x'.repeat(400)}`;
    expect(apiError(new Error(wall)).body.error).toBe('حدث خطأ داخلي');
  });

  it('and hides anything that is not an Error at all', () => {
    expect(apiError('order not found').body.error).toBe('حدث خطأ داخلي');
  });
});

describe('the development detail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is attached outside production and omitted inside it', async () => {
    const error = Object.assign(new Error('boom in /var/app/x.ts'), { name: 'PrismaClientRustPanicError' });

    vi.stubEnv('NODE_ENV', 'development');
    expect(await apiErrorResponse(error).json()).toHaveProperty('detail');

    vi.stubEnv('NODE_ENV', 'production');
    const shipped = await apiErrorResponse(error).json();
    expect(shipped).not.toHaveProperty('detail');
    expect(JSON.stringify(shipped), 'تسرّب مسارٌ إلى المتصفّح').not.toContain('/var/app');
  });
});
