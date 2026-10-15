import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE GUARD THAT WOULD HAVE CAUGHT IT, PROVEN ON THE THING IT MISSED.
 *
 * `prisma/seed.ts` carried `DEV_DEMO_PASSWORD = 'password123'` and the
 * README printed it under a heading. The repository is public, so both
 * were published, and thirteen real accounts were still using that
 * password when somebody finally looked.
 *
 * A scanner nobody has ever watched fail is not a guard — it is a step in
 * a CI file that has always been green. So these plant the exact shapes
 * that leaked and require the scanner to find them, and then require it
 * to stay quiet on the real tree.
 * ═══════════════════════════════════════════════════════════════════════
 */

const SCANNER = 'scripts/scan-secrets.mjs';

/** Exit code and output of the scanner over the given files. */
function scan(...files: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCANNER, ...files], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

let dir: string | null = null;
/** A throwaway file, so nothing planted here is ever a tracked file. */
function plant(name: string, body: string): string {
  dir ??= mkdtempSync(path.join(tmpdir(), 'scan-'));
  const file = path.join(dir, name);
  writeFileSync(file, body, 'utf8');
  return file;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('the scanner finds what this repository actually leaked', () => {
  it('a password written as a literal, the way the seed carried it', () => {
    const { code, out } = scan(plant('seed.ts', `const DEV_DEMO_PASSWORD = 'password123';\n`));
    expect(code, out).toBe(1);
    expect(out).toContain('Password literal');
    expect(out).toContain('seed.ts:1');
  });

  it('and the same password spelled out in a document, the way the README did', () => {
    const { code, out } = scan(plant('README.md', '## Demo Seed Accounts (Password: `password123`)\n'));
    expect(code, out).toBe(1);
    expect(out).toContain('README.md:1');
  });

  it('and in prose with no quoting at all, where no linter would look', () => {
    // The backticked form above is caught by the literal pattern; this one
    // has nothing for that pattern to anchor on, and is what a sentence in
    // a document actually looks like.
    const { code, out } = scan(plant('SETUP.md', 'Sign in with Password: Mubarak2026 and change it after.\n'));
    expect(code, out).toBe(1);
    expect(out).toContain('Password in prose');
  });

  it('and a vendor key, wherever it is — a test file included', () => {
    // Assembled here so the literal never exists in this tracked file.
    const key = ['sk', '-', 'Qp7RtY2vLm9XbNc4KdEf8Ghj'].join('');
    const { code, out } = scan(plant('fixture-data.test.ts', `const k = '${key}';\n`));
    expect(code, out).toBe(1);
    expect(out).toContain('OpenAI key');
  });

  it('and a database URL carrying its own credentials', () => {
    /*
     * Assembled, like the key above, and for a reason worth writing down:
     * the first version of this test spelled the URL out. It passed on the
     * machine that wrote it and failed in CI — because the scanner reads
     * `git ls-files`, and the file was not tracked yet when the suite ran
     * locally. The moment it was committed it became its own finding.
     *
     * Which is the guard behaving correctly. A fixture that looks like a
     * credential IS a credential as far as a scanner can tell, and a test
     * that needs an exemption to pass is a hole with a test around it.
     */
    const url = ['postgresql://', 'zaki', ':', 'Hunter2Hunter', '@', 'db.host:5432/osm'].join('');
    const { code, out } = scan(plant('config.ts', `const u = '${url}';\n`));
    expect(code, out).toBe(1);
    expect(out).toContain('Connection string');
  });

  /**
   * The shapes with no quotes around them. Every pattern above wants a
   * quote after the `=`, which is how CODE is written — and is exactly
   * why they were blind to the likeliest accident in this repository: a
   * value typed into a config file to debug something, and committed.
   */
  it('a real value typed into a .env.example', () => {
    const { code, out } = scan(plant('.env.example', 'SEED_DEMO_PASSWORD=Mubarak2026\n'));
    expect(code, out).toBe(1);
    expect(out).toContain('Unquoted secret assignment');
  });

  it('and the same thing inlined into a compose file', () => {
    const yaml = 'services:\n  db:\n    environment:\n      POSTGRES_PASSWORD: Mubarak2026\n';
    const { code, out } = scan(plant('docker-compose.yml', yaml));
    expect(code, out).toBe(1);
    expect(out).toContain('docker-compose.yml:4');
  });

  it('and a private key committed as a file', () => {
    const pem = `-----BEGIN RSA PRIVATE ${'KEY'}-----\nMIIEow==\n-----END RSA PRIVATE ${'KEY'}-----\n`;
    const { code, out } = scan(plant('id_rsa', pem));
    expect(code, out).toBe(1);
    expect(out).toContain('Private key block');
  });

  it('and it never prints the value it found', () => {
    const { out } = scan(plant('seed.ts', `const DEV_DEMO_PASSWORD = 'password123';\n`));
    // The CI log is public too. A finding that quotes the secret moves it
    // from one published place to another.
    expect(out, 'السكانر طبع السرّ نفسه').not.toContain('password123');
  });
});

describe('and it stays quiet on what is not a secret', () => {
  it('a named placeholder, an env var and a generated one', () => {
    const { code, out } = scan(
      plant(
        'docs.md',
        [
          'DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/salesflow',
          'JWT_SECRET=<openssl rand -base64 32>',
          'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}',
        ].join('\n')
      )
    );
    expect(code, out).toBe(0);
  });

  it('a password field that holds a label, not a value', () => {
    const { code, out } = scan(plant('zod.ts', `  password: 'كلمة المرور',\n`));
    expect(code, out).toBe(0);
  });

  it('a URL whose name happens to end in token', () => {
    const { code, out } = scan(plant('oauth.ts', `  tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',\n`));
    expect(code, out).toBe(0);
  });

  it('a compose file that does it right', () => {
    const yaml = [
      'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}',
      'JWT_SECRET=',
      'API_TOKEN: # set in Coolify',
    ].join('\n');
    const { code, out } = scan(plant('docker-compose.yml', yaml));
    expect(code, out).toBe(0);
  });

  it('and the unquoted shape inside ordinary code, where it is not that shape at all', () => {
    // `password: someVariable` is how objects are written. The unquoted
    // rule applies only to files whose grammar is `NAME: value`.
    const { code, out } = scan(plant('handler.ts', '  const body = { password: hashedInput };\n'));
    expect(code, out).toBe(0);
  });

  it('and a sha-256 vector in a test file', () => {
    const { code, out } = scan(
      plant('hash.test.ts', `expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');\n`)
    );
    expect(code, out).toBe(0);
  });
});

describe('and the tree that ships is clean', () => {
  it('every tracked file passes', () => {
    // This is the assertion the CI step makes. It is here too so the
    // failure arrives in the suite, beside the change that caused it,
    // rather than four minutes later in a workflow log.
    const { code, out } = scan();
    expect(code, out).toBe(0);
    expect(out).toContain('Secret scan clean');
  });
});
