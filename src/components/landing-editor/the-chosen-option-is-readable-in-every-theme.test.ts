import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «الخط مش مبين لما اكون ضاغط ع الزر». The chosen option of every segmented control in the landing editor sat on the
 * theme's card colour (`--sys-card`) with its words in a FIXED near-black — readable on the light themes, invisible on
 * the dark ones, exactly where the seller looks to see what is chosen. Words on a theme surface take the theme's own
 * colour.
 */

const DIR = join(process.cwd(), 'src/components/landing-editor');
const files = readdirSync(DIR).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));
const FIXED_DARK_TEXT = /\btext-\[#(?:0|1)[0-9a-fA-F]{5}\]|\btext-(?:slate|gray|zinc|neutral)-[789]00\b|\btext-black\b/;

describe('the editor’s words on theme surfaces', () => {
  it('no fixed dark text colour anywhere in the editor — it disappears on a dark theme', () => {
    const offenders = files.flatMap((f) =>
      readFileSync(join(DIR, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => FIXED_DARK_TEXT.test(line))
        .map(({ line, i }) => `${f}:${i + 1}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });

  it('the chosen option takes the theme’s heading colour, on hover too', () => {
    for (const f of ['AfterOrderPanel.tsx', 'BlockBuilder.tsx']) {
      const src = readFileSync(join(DIR, f), 'utf8');
      expect(src).toContain("bg-[var(--sys-card)] text-[var(--sys-heading)] shadow-raised");
      expect(src).toContain('hover:text-[var(--sys-heading)]');
    }
  });

  it('NEGATIVE: the guard sees the colour it exists for', () => {
    expect(FIXED_DARK_TEXT.test("'bg-[var(--sys-card)] text-[#0f172a] shadow-raised'")).toBe(true);
    expect(FIXED_DARK_TEXT.test("'text-[var(--sys-heading)]'")).toBe(false);
  });
});
