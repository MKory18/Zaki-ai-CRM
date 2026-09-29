import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ARABIC LETTERS TOUCH.
 *
 * `letter-spacing` pulls them apart, so «الطلبات» is drawn as eight loose
 * shapes instead of one word. A reader does not see a style — they see a
 * broken font.
 *
 * The product already knew this in one place. `DashboardScreen` carries
 * the sentence «No `uppercase tracking-wide`: the label is Arabic, and
 * spacing a joined script out stops its letters touching», one heading
 * was fixed, and twenty-six others across eight navigation groups went on
 * doing it — section headings on the order dialog, the shipping card, the
 * customer's history, the product form, the assistant, the app store, the
 * employee's page.
 *
 * `uppercase` goes with it. Arabic has no case, so on an Arabic label it
 * does nothing; on a bilingual one it shouts only at the English half.
 *
 * LATIN IS NOT TOUCHED. A spaced-out Latin label is a style, and nothing
 * here objects to it — only to a joined script being taken apart.
 */

const root = process.cwd();
const ARABIC = /[\u0600-\u06FF]/;
const SPACING = /\btracking-(?:tight|tighter|wide|wider|widest)\b/;

function tsxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(join(root, 'src', 'components'));
  walk(join(root, 'src', 'app'));
  return out;
}

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('nothing spaces out a joined script', () => {
  const files = tsxFiles();
  const offenders: string[] = [];
  for (const file of files) {
    const lines = code(readFileSync(join(root, file), 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!SPACING.test(lines[i])) continue;
      // What the element renders: its own line and the few under it,
      // which is where a heading's text sits.
      if (ARABIC.test(lines.slice(i, i + 4).join(' '))) {
        offenders.push(`${file}:${i + 1}   ${lines[i].trim().slice(0, 70)}`);
      }
    }
  }

  it('found files to check — a sweep over nothing proves nothing', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('and no Arabic is drawn with letter-spacing', () => {
    expect(
      offenders,
      `نصٌّ عربيٌّ بتباعُدِ حروف — الحروفُ تنفصل:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
