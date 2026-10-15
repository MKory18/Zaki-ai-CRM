import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE SEED IS A LOADED GUN, AND IT RUNS ON EVERY DEPLOY.
 *
 * `docker-entrypoint.sh` calls `prisma/seed.ts` on startup, so this file
 * is not a developer convenience that sits still — it executes on the
 * production container. And what it does is `deleteMany` over every
 * business table and then create accounts with a shared password.
 *
 * It has refused `NODE_ENV=production` for a while. What it did NOT do
 * was stop carrying the password: the literal was readable in a public
 * repository whether the seed ever ran or not, and thirteen real accounts
 * were still using it.
 *
 * So there are two refusals to hold here, and they fail for different
 * reasons: it must refuse to run in production, and it must refuse to
 * invent a demo password when nobody gave it one.
 *
 * Asked by running the file. A gate written at module scope is only a
 * gate if the process actually stops.
 * ═══════════════════════════════════════════════════════════════════════
 */

const TSX = 'node_modules/tsx/dist/cli.mjs';

function runSeed(env: Record<string, string | undefined>): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [TSX, 'prisma/seed.ts'], {
      encoding: 'utf8',
      stdio: 'pipe',
      /*
       * A deliberately unreachable database: if any refusal below ever
       * stops working, this test must not be the thing that writes.
       *
       * And with no password in it — not because one would be secret, but
       * because `user:pass@host` is the shape the secret scanner looks
       * for, and a fixture that has to be exempted from a guard is a hole
       * with a test around it. Port 1 is what makes it unreachable; the
       * credential never did.
       */
      env: { ...process.env, DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/none', ...env },
      timeout: 60_000,
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('the seed refuses', () => {
  it('to run at all when NODE_ENV is production', () => {
    const { code, out } = runSeed({ NODE_ENV: 'production', SEED_DEMO_PASSWORD: 'irrelevant-here' });
    expect(code, out).toBe(1);
    expect(out, 'ما قال ليش بالعربي').toContain('ممنوع');
    expect(out).toContain('ما بيشتغل على الإنتاج');
  });

  it('and still refuses when the destructive escape hatch is open', () => {
    // SEED_ALLOW_DESTRUCTIVE=1 is for a throwaway database. It is not a
    // way to create demo accounts on production, so the second gate holds
    // after the first one has been waved through.
    const { code, out } = runSeed({
      NODE_ENV: 'production',
      SEED_ALLOW_DESTRUCTIVE: '1',
      SEED_DEMO_PASSWORD: 'irrelevant-here',
    });
    expect(code, out).toBe(1);
    // A string only the SECOND gate prints. «حسابات التجربة» appears in
    // both messages, so asserting on it would stay green if this gate
    // were deleted — which is the one thing this test exists to notice.
    expect(out, 'البوّابة الثانية ما ردّت').toContain('SEED_OWNER_EMAIL');
  });

  it('and to invent a demo password when nobody set one', () => {
    const { code, out } = runSeed({ NODE_ENV: 'development', SEED_DEMO_PASSWORD: undefined });
    expect(code, out).toBe(1);
    expect(out).toContain('SEED_DEMO_PASSWORD');
  });

  it('and neither refusal prints a password', () => {
    const a = runSeed({ NODE_ENV: 'production', SEED_DEMO_PASSWORD: 'Mubarak-Secret-2026' });
    const b = runSeed({ NODE_ENV: 'development', SEED_DEMO_PASSWORD: undefined });
    expect(a.out, 'طبع كلمة السرّ برسالة الرفض').not.toContain('Mubarak-Secret-2026');
    expect(b.out).not.toContain('password123');
  });
});
