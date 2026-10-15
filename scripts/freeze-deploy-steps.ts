import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE DEPLOY PIPELINE'S FROZEN STEPS — the lock, and the tool that writes it.
 *
 * ── WHY A FROZEN COPY AND NOT A GUARD ──
 *
 * `image.yml` builds the production image, proves it starts and reports
 * itself healthy, and pushes exactly what ran. The first guard over it was
 * a list of spellings: not `docker build`, not `buildx build`, the branch
 * gate must read like THIS, every pushed name must have been `docker
 * tag`ged from the proved image. Three rounds of widening that list, and a
 * review beat it six more ways — `docker builder build`, a second
 * `bake-action`, `docker pull` + `docker tag`, `docker commit`,
 * `docker load`, `podman build` — each of them putting an image nothing
 * had proved into the registry while every claim stayed green. Widening it
 * once more opened a hole of its own: the looser gate pattern accepted
 * `if: ${{ !(github.ref == 'refs/heads/main') }}`, which publishes from
 * every branch EXCEPT main.
 *
 * A guard that is a list is incomplete the day it is written. So the list
 * is gone. The lock file holds the five steps' exact text, and the test
 * asks one question: are these still the steps that were read?
 *
 * Any edit to any of them — a new command, a moved gate, a reworded
 * comment, a changed timeout — turns the test red until this script is run
 * ON PURPOSE. That is the point: the deploy pipeline is not something to
 * adjust in passing, and the one-line diff in the lock file is exactly the
 * second look that was missing.
 *
 *     npm run freeze:deploy
 */

/** The steps whose exact text is frozen, in the order they must appear. */
export const FROZEN_STEPS = [
  'The image name and the tag',
  'Build it, into this runner',
  'Does the image declare a health check?',
  'Does it start, migrate, and report itself healthy?',
  'Publish the proved image, under both tags',
] as const;

export const WORKFLOW = '.github/workflows/image.yml';
export const LOCK = '.github/workflows/image.proved-steps.lock';

/**
 * The frozen steps, pulled out of the workflow in the locked order.
 *
 * A missing step becomes a `### MISSING STEP` line rather than nothing, so
 * renaming a step to slip out of the freeze FAILS the comparison instead
 * of quietly shrinking what is compared.
 */
export function frozenText(workflow: string): string {
  // LINE ENDINGS NORMALISED FIRST. This repository is worked on with
  // `core.autocrlf=true`, so the working tree holds CRLF while the commit
  // holds LF — and CI checks out LF. Comparing the raw bytes would mean a
  // lock written on Windows could never match on the runner, which is a
  // red test that says nothing about the pipeline.
  const blocks = workflow.replace(/\r\n/g, '\n').split(/\n(?= {6}- )/);
  return (
    FROZEN_STEPS.map((name) => {
      const block = blocks.find((b) => b.startsWith(`      - name: ${name}`));
      return block ? block.replace(/\s+$/, '') : `### MISSING STEP: ${name}`;
    }).join('\n\n') + '\n'
  );
}

/** Only when this file is the thing being run — never on import. */
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/freeze-deploy-steps.ts')) {
  const root = process.cwd();
  const text = frozenText(readFileSync(join(root, WORKFLOW), 'utf8'));
  writeFileSync(join(root, LOCK), text, 'utf8');
  if (text.includes('MISSING STEP')) {
    console.error('⚠️  خطوة مجمّدة مفقودة أو انتغيّر اسمها — اقرا الملفّ قبل ما تكمّل:');
    console.error(
      text
        .split('\n')
        .filter((l) => l.startsWith('### MISSING STEP'))
        .join('\n')
    );
    process.exit(1);
  }
  console.log(`${LOCK} — ${FROZEN_STEPS.length} خطوات مجمّدة`);
}
