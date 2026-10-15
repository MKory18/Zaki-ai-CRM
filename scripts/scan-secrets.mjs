#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * A SECRET THAT REACHES A COMMIT IS A SECRET THAT HAS TO BE CHANGED.
 *
 * This repository is public. A password written in a file here is not «in
 * the code» — it is published, and it stays published in the history after
 * somebody deletes the line. The demo password that thirteen real accounts
 * were still carrying got there exactly that way: one literal, in one
 * file, that nobody looked at again.
 *
 * So this runs in CI, right after the linter, and fails the build.
 *
 * Ported from System 7 (MKory18/AIresponse → scripts/scan-secrets.mjs),
 * with three adaptations this repository needs:
 *
 *   1. It walks `git ls-files`, not the working directory. The original
 *      walked the tree and skipped `.next`, `node_modules` and friends by
 *      name — a list that is wrong the day somebody adds a build
 *      directory. What matters is what is COMMITTED, and git already
 *      knows that: `.env` is ignored, so it is never read, and no skip
 *      list has to stay up to date.
 *   2. Paths may be passed as arguments, so the scanner can be run
 *      against a fixture instead of the repository. That is what makes it
 *      testable: a guard nobody has ever seen fail is not a guard.
 *   3. Patterns for what THIS repository would leak: a password assigned
 *      as a literal, and a database URL carrying its own credentials.
 *
 * Run: npm run scan:secrets
 * ═══════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Values that are obviously not real. A scanner that cries at every test
 * fixture gets switched off, and then it protects nothing.
 */
const ALLOW_PATTERNS = [
  /test-/i,
  /0000+/,
  /placeholder/i,
  /dummy/i,
  /fixture/i,
  /example/i,
  /xxx+/,
  /DEMO#/,
  /\bfake\b/i,
  /<[A-Z_]{3,}>/,          // <DB_PASSWORD> — a named placeholder
  /\$\{[A-Za-z_]/,          // ${POSTGRES_PASSWORD} — shell or compose interpolation
  /process\.env\./,         // read from the environment, which is the point
  /openssl rand/,           // the instruction to generate one
];

/**
 * TWO KINDS OF PATTERN, AND THEY DESERVE DIFFERENT TREATMENT.
 *
 * A vendor-SHAPED key — `sk-…`, `ghp_…`, `AKIA…` — is a near-certainty
 * wherever it appears, a test file included. Nobody types those by
 * accident, and a real one pasted into a fixture is exactly the mistake
 * worth catching. Those run everywhere: `scope: 'all'`.
 *
 * The other two are SHAPE GUESSES — «something called password holds a
 * string», «thirty-two hex characters». In source they are good signal. In
 * test files they match sha-256 vectors, pixel ids and `Passw0rdOk`, and a
 * scanner that shouts twenty times on a clean tree is a scanner somebody
 * switches off within a week. Those skip tests: `scope: 'src'`.
 *
 * What that costs, said plainly: a real password hidden in a test file
 * under the name `password` is not caught. What still catches it is every
 * pattern above it, which is where real vendor credentials actually look
 * like themselves.
 */
const IS_TEST = /\.test\.[tj]sx?$|\/__tests__\/|\.spec\.[tj]sx?$/;

const PATTERNS = [
  { name: 'OpenAI key', scope: 'all', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'Anthropic key', scope: 'all', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'Long-lived FB token', scope: 'all', re: /EAAG[A-Za-z0-9]{20,}/ },
  { name: 'GitHub token', scope: 'all', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'AWS access key', scope: 'all', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Slack token', scope: 'all', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'JWT secret assignment', scope: 'all', re: /JWT_SECRET\s*=\s*(?!$)(?=.*[A-Za-z0-9]{32,})/ },
  // A connection string that carries its own credentials.
  {
    name: 'Connection string with credentials',
    scope: 'all',
    re: /(postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^\s'"`/]+:[^\s'"`@]+@/,
  },
  { name: 'Meta App Secret', scope: 'src', re: /[0-9a-f]{32}(?![0-9a-f])/ },
  /**
   * The one this repository actually leaked: a password written as a
   * literal. Read it left to right —
   *   the name must END at the keyword, so `tokenUrl` and `SECRET_NAME`
   *   are not it; then an `=` or a `:`; then a quote; then a value that
   *   is not a URL, not `${…}`, not `<NAMED>`; and the value has to carry
   *   at least six ASCII letters-or-digits, because `'كلمة المرور'` is a
   *   label and `'password123'` is a credential.
   */
  {
    name: 'Password literal',
    scope: 'src',
    re: /\b[A-Za-z_]*(?:PASSWORD|PASSWD|SECRET|API_?KEY|TOKEN)\s*[=:]\s*['"`](?!https?:|\$\{|<)(?=[^'"`]*(?:[A-Za-z0-9][^'"`]*){6})[^'"`\s]{6,}['"`]/i,
  },
  /**
   * And the same credential outside code: prose that tells the reader what
   * the password is. This is how it reached the README — "Demo Seed
   * Accounts (Password: …)" — where no quoting rule applies and no linter
   * looks.
   *
   * Documents only. In code, `password:` is a type annotation, a field
   * name and a function argument on nearly every line that mentions it,
   * and the pattern above already covers the case that matters there.
   */
  {
    name: 'Password in prose',
    scope: 'docs',
    re: /\b(password|كلمة السر|كلمة السرّ|كلمة المرور)\s*[:=]\s*[`'"]?[A-Za-z0-9!@#$%^&*_.-]{6,}[`'"]?/i,
  },
];

/** Where prose lives. */
const IS_DOC = /\.(md|markdown|txt|rst|adoc)$/i;

/** An ALL_CAPS value is the NAME of an environment variable, not its value. */
const ENV_NAME_VALUE = /['"`][A-Z][A-Z0-9_]{4,}['"`]/;

/** Binary and generated files have nothing to say and plenty to false-positive. */
const SKIP_EXT = /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|eot|pdf|zip|gz|lock)$/i;
const SKIP_FILES = new Set(['package-lock.json', 'tsconfig.tsbuildinfo']);

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

const argv = process.argv.slice(2);
const files = (argv.length ? argv : trackedFiles()).filter(
  (f) => !SKIP_EXT.test(f) && !SKIP_FILES.has(f.split('/').pop())
);

let findings = 0;
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  // A file this scanner cannot read as text is a file it cannot judge.
  if (content.includes('\u0000')) continue;

  const isTest = IS_TEST.test(file);
  const isDoc = IS_DOC.test(file);

  content.split('\n').forEach((line, i) => {
    if (ALLOW_PATTERNS.some((a) => a.test(line))) return;
    if (ENV_NAME_VALUE.test(line)) return;
    for (const p of PATTERNS) {
      if (p.scope === 'src' && isTest) continue;
      if (p.scope === 'docs' && !isDoc) continue;
      if (p.re.test(line)) {
        // The finding names the place, never the value — printing it here
        // would put the secret in the CI log, which is the one place it
        // would then live forever.
        console.error(`SECRET?? ${p.name} at ${file}:${i + 1}`);
        findings += 1;
        // One line, one finding. Two patterns agreeing is not two problems,
        // and a doubled list reads as twice the work to review.
        break;
      }
    }
  });
}

if (findings > 0) {
  console.error(
    `\n${findings} potential secret(s) found in tracked files.\n` +
    'Review each one. If it is genuinely fake, make it look fake — the\n' +
    'allow-list reads test-, example, placeholder, dummy, fixture, <NAMED>,\n' +
    '${VAR} and process.env. If it is real: change it at the provider, then\n' +
    'remove it here. Deleting the line does not remove it from the history.\n'
  );
  process.exit(1);
}
console.log(`Secret scan clean — ${files.length} tracked files.`);
