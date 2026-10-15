import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A BUILD THAT FETCHES A FONT IS A BUILD THAT CAN FAIL FOR NO REASON.
 *
 * `src/app/(system)/fonts.ts` called `next/font/google`, which downloads
 * the faces from `fonts.googleapis.com` and `fonts.gstatic.com` AT BUILD
 * TIME. One CI run failed with six copies of
 *
 *     Module not found: Can't resolve
 *     '@vercel/turbopack-next/internal/font/google/font'
 *
 * and then passed on a re-run with nothing changed.
 *
 * That was a nuisance while a build only gated a pull request. It stopped
 * being one when the build became the DEPLOY: `image.yml` builds the
 * production image, so the same hiccup stops a release.
 *
 * And it cost nothing to fix: `next/font/google` self-hosts those files
 * anyway, so the bytes are identical — they just come from here now.
 *
 * The rules below are about the RULE, not about today's file names: no
 * font may be fetched at build time, every face named must exist, and the
 * licence must travel with them.
 * ═══════════════════════════════════════════════════════════════════════
 */

const FONT_DIR = 'src/app/(system)/fonts';

describe('the dashboard’s faces', () => {
  it('are not fetched from anybody at build time', () => {
    const src = stripComments(repoFile('src/app/(system)/fonts.ts'));
    expect(src, 'الخطّ بينتجاب من Google وقت البناء').not.toContain('next/font/google');
    expect(src).toContain('next/font/local');
  });

  it('and no screen anywhere reaches for a hosted font loader', () => {
    // One file deciding this is the whole point; a second caller would
    // reintroduce the dependency quietly on one screen.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(process.cwd(), rel)).isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry) || entry.includes('.test.')) continue;
        if (stripComments(repoFile(rel)).includes('next/font/google')) offenders.push(rel);
      }
    };
    walk('src');
    expect(offenders, `خطّ بينتجاب من الشبكة:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and every face the loader names is actually in the repository', () => {
    // A path typo here is not a type error and not a crash: the weight
    // simply never loads, and the browser synthesises it — bold that is
    // not the bold the family drew.
    const src = repoFile('src/app/(system)/fonts.ts');
    const paths = [...src.matchAll(/path:\s*'\.\/(fonts\/[\w.-]+\.woff2)'/g)].map((m) => m[1]);
    expect(paths.length, 'ما في ولا ملفّ خطّ مُسمّى').toBeGreaterThanOrEqual(6);
    for (const p of paths) {
      expect(
        existsSync(join(process.cwd(), 'src/app/(system)', p)),
        `الخطّ مذكور وغير موجود: ${p}`
      ).toBe(true);
    }
  });

  it('and nothing sits in the folder that nothing names', () => {
    // 40 KB apiece. A file left behind after a weight is dropped is 40 KB
    // in every clone and in every image, for nobody.
    const src = repoFile('src/app/(system)/fonts.ts');
    for (const file of readdirSync(join(process.cwd(), FONT_DIR))) {
      if (!file.endsWith('.woff2')) continue;
      expect(src, `ملفّ خطّ ما حدا بيناديه: ${file}`).toContain(file);
    }
  });

  it('and the licence travels with them, naming what it covers', () => {
    // Both families are SIL OFL 1.1 and this repository is public.
    const licence = repoFile(`${FONT_DIR}/OFL.txt`);
    expect(licence).toContain('SIL Open Font License');
    for (const family of ['plex-arabic', 'plex-latin', 'public-latin']) {
      expect(licence, `الرخصة ما بتسمّي ${family}`).toContain(family);
    }
  });

  it('and the stack names every family the loader defines', () => {
    /*
     * Google serves each family split by script and `localFont` takes one
     * file per weight, so the Arabic and Latin halves of Plex are two
     * families. If the stack in `system.css` names only the first, every
     * Latin digit on the dashboard falls past it to Public Sans — a
     * different face beside the Arabic it sits next to, which is the
     * exact fault this family was chosen to avoid.
     */
    const loader = stripComments(repoFile('src/app/(system)/fonts.ts'));
    const vars = [...loader.matchAll(/variable:\s*'(--[\w-]+)'/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThanOrEqual(2);

    const css = repoFile('src/app/(system)/system.css');
    const frame = repoFile('src/app/(system)/SystemFrame.tsx');
    for (const v of vars) {
      expect(css, `${v} معرَّف وما حدا بيستعمله بالمكدّس`).toContain(`var(${v})`);
      expect(frame, `${v} ما بينتعبّى بقيمة`).toContain(v);
    }
  });
});
