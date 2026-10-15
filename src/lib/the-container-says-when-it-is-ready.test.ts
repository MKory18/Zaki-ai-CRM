import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE LINE THAT LOOKED LIKE A HEALTH CHECK FOR FOUR MONTHS.
 *
 * What stood at the end of the Dockerfile was this, indented by two
 * spaces:
 *
 *     CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1
 *
 * Every word of a health check except the word `HEALTHCHECK`. Docker reads
 * it as the container's default COMMAND, and since an `ENTRYPOINT` is set
 * two lines below, those words became ARGUMENTS to the entrypoint script —
 * which ends in `exec node server.js` and never reads `"$@"`. So the line
 * probed nothing, ran nothing, and `docker inspect` reported the image as
 * having no health check at all. Nothing anywhere said so.
 *
 * That is why the rules below are RULES and not a copy of the new line. A
 * guard that checked for the text `wget …/login` would have passed on the
 * broken version; a guard that checks for the literal `/api/health` would
 * pass on a probe pointed at a route that no longer exists. So:
 *
 *   - there must be a HEALTHCHECK instruction, read as Docker reads it;
 *   - whatever path it probes must be a route that EXISTS in this app;
 *   - that route must answer without a session, because the probe has
 *     none and never will;
 *   - and a bare `CMD` may not sit next to an `ENTRYPOINT` that ignores
 *     its arguments — the exact shape of the original defect.
 *
 * `docker inspect` is the only thing that can prove the IMAGE declares the
 * check, and that proof belongs where Docker runs: `.github/workflows/
 * image.yml` builds the image, starts it against a real database, and
 * fails if the container never reports itself healthy. This file holds the
 * part that can be known without a daemon, and the last two claims hold
 * the workflow that holds the rest.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** The Dockerfile as Docker sees it: no comments, continuations joined. */
function instructions(): { keyword: string; rest: string }[] {
  const joined = repoFile('Dockerfile')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, ' ');
  return joined
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([A-Za-z]+)\s+([\s\S]*)$/.exec(l);
      return { keyword: (m?.[1] ?? l).toUpperCase(), rest: m?.[2] ?? '' };
    });
}

describe('the image says whether it is ready', () => {
  it('declares a HEALTHCHECK — the instruction, not a line that resembles one', () => {
    const health = instructions().filter((i) => i.keyword === 'HEALTHCHECK');
    expect(health, 'الصورة بلا HEALTHCHECK — Coolify ما بيعرف إذا الحاوية جاهزة').toHaveLength(1);
    // `HEALTHCHECK NONE` is a legal instruction that switches it OFF.
    expect(health[0].rest.trim().toUpperCase()).not.toBe('NONE');
    expect(health[0].rest).toMatch(/\bCMD\b/);
  });

  it('and waits long enough for the migrations the entrypoint runs first', () => {
    // The container runs `prisma migrate deploy` before the server listens.
    // With no start period, a container that is starting normally is killed
    // for failing a check it could not yet answer — and the deploy loops.
    const [health] = instructions().filter((i) => i.keyword === 'HEALTHCHECK');
    const start = /--start-period=(\d+)s/.exec(health.rest);
    expect(start, 'بلا --start-period الحاوية بتنقتل وهي عمّا تقلع').not.toBeNull();
    expect(Number(start![1])).toBeGreaterThanOrEqual(60);

    const retries = /--retries=(\d+)/.exec(health.rest);
    expect(retries, 'بلا --retries رفض واحد بيكفي').not.toBeNull();
    expect(Number(retries![1])).toBeGreaterThanOrEqual(2);
  });

  it('probes a route this app actually serves', () => {
    const [health] = instructions().filter((i) => i.keyword === 'HEALTHCHECK');
    const url = /https?:\/\/[^/\s]+(\/[^\s"']*)/.exec(health.rest);
    expect(url, 'الفحص ما بينادي عنواناً').not.toBeNull();

    const path = url![1].replace(/\?.*$/, '').replace(/\/$/, '');
    const route = join('src', 'app', path, 'route.ts');
    const page = join('src', 'app', path, 'page.tsx');
    expect(
      existsSync(join(process.cwd(), route)) || existsSync(join(process.cwd(), page)),
      `الفحص بينادي ${path} وما في شي بهالعنوان`
    ).toBe(true);
  });

  it('and that route answers without a session, because the probe has none', () => {
    // A probe carries no cookie and never will. Pointing the check at an
    // authenticated path turns every container unhealthy at once — and the
    // orchestrator would then restart a perfectly working app, for ever.
    const [health] = instructions().filter((i) => i.keyword === 'HEALTHCHECK');
    const path = /https?:\/\/[^/\s]+(\/[^\s"']*)/
      .exec(health.rest)![1]
      .replace(/\?.*$/, '')
      .replace(/\/$/, '');
    const file = join('src', 'app', path, 'route.ts');
    if (!existsSync(join(process.cwd(), file))) return; // a page, covered above
    // Comments stripped first, and the CALL and not the name: that route's
    // own header explains at length that authentication in this codebase
    // lives in each handler and names `requirePermission` while doing it —
    // so the first version of this claim failed on the prose that says the
    // route is open. Seventh time a guard here has read its own paperwork.
    const src = stripComments(repoFile(file));
    for (const gate of ['requirePermission', 'requireCompanyTenant', 'requireContext', 'requireAuth']) {
      expect(src, `${path} بيطلب تسجيل دخول، والفحص ما عنده جلسة`).not.toContain(`${gate}(`);
    }
  });

  it('carries no bare CMD beside an ENTRYPOINT that ignores its arguments', () => {
    /*
     * THE ORIGINAL DEFECT, AS A RULE.
     *
     * With an ENTRYPOINT set, a `CMD` is not a command — it is the default
     * ARGUMENTS handed to that entrypoint. `docker-entrypoint.sh` ends in
     * `exec node server.js` and never mentions `"$@"`, so anything a `CMD`
     * says is read by nobody. A line nobody reads that looks exactly like a
     * line that matters is how four months passed with no health check.
     */
    const ins = instructions();
    const hasEntrypoint = ins.some((i) => i.keyword === 'ENTRYPOINT');
    const bareCmd = ins.filter((i) => i.keyword === 'CMD');
    if (!hasEntrypoint || bareCmd.length === 0) return;

    const entrypoint = repoFile('docker-entrypoint.sh');
    expect(
      entrypoint.includes('"$@"') || entrypoint.includes('$@'),
      'في CMD بالـDockerfile وENTRYPOINT ما بيقرا وسائطه — فالسطر ما بيعمل ولا إشي'
    ).toBe(true);
  });
});

describe('the image is built off the server, and proved before it is published', () => {
  const workflow = () => repoFile('.github/workflows/image.yml');

  /** A workflow step's shell body, by a word that appears in it. */
  const stepWith = (needle: string): string => {
    const steps = workflow().split(/\n {6}- /);
    return steps.find((s) => s.includes(needle)) ?? '';
  };

  it('starts the image and refuses to publish one that never reports healthy', () => {
    const wf = workflow();
    // Docker's own verdict on the running container — not a reading of the
    // Dockerfile, which is what this whole file exists to distrust.
    expect(wf).toContain('State.Health');
    expect(wf).toContain('Config.Healthcheck');

    // Order matters more than presence: proving the image AFTER pushing it
    // means the registry holds a tag that breaks production when pulled.
    const proof = wf.indexOf('State.Health');
    const publish = wf.indexOf('push: true');
    expect(proof, 'النشر قبل الإثبات').toBeLessThan(publish);
  });

  it('publishes a tag that names the commit, so a rollback can name one too', () => {
    expect(workflow()).toMatch(/sha-\$\(echo "\$\{\{ github\.sha \}\}"/);
  });

  it('says nothing to Coolify until both of its secrets exist', () => {
    // Merging this file must change nothing on a day nobody touches the
    // server: production keeps deploying from the mirrors, and this step
    // prints one line and succeeds.
    const step = stepWith('COOLIFY_WEBHOOK_URL');
    expect(step, 'ما في خطوة نداء لـCoolify').not.toBe('');

    const guard = step.indexOf('-z "${COOLIFY_WEBHOOK_URL');
    const call = step.indexOf('curl');
    expect(guard, 'النداء بلا حارس على السرّين').toBeGreaterThan(-1);
    expect(step).toContain('-z "${COOLIFY_TOKEN');
    expect(guard, 'الحارس بعد النداء').toBeLessThan(call);
  });

  it('and reads every secret through env, never into the shell line', () => {
    /*
     * `${{ secrets.X }}` inside a `run:` block is substituted into the
     * script BEFORE the shell runs it. From then on the token is part of
     * the command text: it reaches the log under `set -x`, in a syntax
     * error, and in any message that quotes the failing line. Through
     * `env:` it is a masked variable instead.
     */
    for (const block of workflow().split(/\n {6}- /)) {
      const run = block.indexOf('run: |');
      if (run === -1) continue;
      const body = block.slice(run);
      expect(body.includes('${{ secrets.'), 'سرّ مكتوب جوّا سطر الصدفة').toBe(false);
    }
  });
});

describe('and the secret scanner is not a thing somebody has to remember', () => {
  it('runs in CI, which is what its own header has been claiming', () => {
    // `scripts/scan-secrets.mjs` said «this runs in CI, right after the
    // linter, and fails the build» from the day it was written, and for a
    // while nothing in `.github/` mentioned it. The password that thirteen
    // real accounts were using is in this repository's history because
    // nothing ever looked.
    const script = JSON.parse(repoFile('package.json')).scripts?.['scan:secrets'];
    expect(script, 'ما في سكربت scan:secrets').toBeTruthy();

    const ci = repoFile('.github/workflows/ci.yml');
    expect(ci, 'الحارس مش بالـCI — فهو بيشتغل لمّا حدا يتذكّره').toContain('scan:secrets');

    // Before the tests, not after: a leaked credential is not something to
    // learn about four minutes later.
    expect(ci.indexOf('scan:secrets')).toBeLessThan(ci.indexOf('npm test'));
  });
});
