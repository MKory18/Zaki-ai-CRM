import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE CLEAN-UP INVENTORY SAYS WHAT IT DID, AND POINTS AT WHAT IT SAW.
 *
 * Phase 4 of «سلاسة مطلقة» («التنظيف») recorded every candidate it looked at
 * in scripts/cleanup-inventory.json — what was folded under «متقدم» (hide),
 * what looked like a merge or a deletion and is not (keep), and what waits
 * for the owner's word (keep, with the reason saying so). The rules here are
 * the ones the house set for that phase:
 *
 *   - every entry has exactly {kind, location, evidence, safeAction, reason},
 *     and safeAction is one of hide | merge | keep;
 *   - every evidence is `file:line` on a file that exists, at a line it has —
 *     so the inventory cannot quietly point at nothing;
 *   - «hide» means «folded on a screen», never removed: a hide entry points at
 *     a screen that really draws an AdvancedGroup;
 *   - a permission key that is enforced but granted to no role is the OWNER'S
 *     decision (roles are granted at runtime from the Permissions screen), so
 *     it is recorded as keep — never hidden, never merged;
 *   - a money screen is never merged into another one;
 *   - a deletion candidate stays on disk until the owner says delete.
 *
 * The check on lines is deliberately loose (the line exists, not «the line
 * still says X»): the files keep moving under other work, and an inventory
 * that turned red every time somebody added an import above a cited line
 * would be a tax on everyone else.
 */

interface Entry {
  kind: string;
  location: string;
  evidence: string;
  safeAction: 'hide' | 'merge' | 'keep';
  reason: string;
}

const ROOT = process.cwd();
const entries = JSON.parse(readFileSync(join(ROOT, 'scripts/cleanup-inventory.json'), 'utf8')) as Entry[];

/** «a.ts:12 · b.ts:3» → [['a.ts', 12], ['b.ts', 3]] */
function cited(evidence: string): Array<[string, number]> {
  return evidence.split(' · ').map((part) => {
    const m = part.trim().match(/^(.+):(\d+)$/);
    expect(m, `دليل مش بصيغة file:line — «${part}»`).not.toBeNull();
    return [m![1], Number(m![2])] as [string, number];
  });
}

describe('scripts/cleanup-inventory.json — the clean-up says what it did and points at what it saw', () => {
  it('is a list of entries, each with exactly the five fields and a known action', () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(Object.keys(e).sort(), JSON.stringify(e).slice(0, 80)).toEqual(['evidence', 'kind', 'location', 'reason', 'safeAction']);
      expect(['hide', 'merge', 'keep']).toContain(e.safeAction);
      for (const field of ['kind', 'location', 'reason'] as const) expect(e[field].trim().length, `${e.location}: ${field} فاضي`).toBeGreaterThan(0);
    }
  });

  it('points every evidence at a file that exists, at a line that file has', () => {
    for (const e of entries) {
      for (const [file, line] of cited(e.evidence)) {
        const abs = join(ROOT, file);
        expect(existsSync(abs), `${e.location}: الملف ${file} مش موجود`).toBe(true);
        const lines = readFileSync(abs, 'utf8').split('\n').length;
        expect(line >= 1 && line <= lines, `${e.location}: ${file}:${line} خارج الملف (${lines} سطر)`).toBe(true);
      }
    }
  });

  it('means «folded on a screen» by hide — every hide entry is a screen that draws «متقدم»', () => {
    const hides = entries.filter((e) => e.safeAction === 'hide');
    expect(hides.length, 'الشاشات الثماني لازم تكون مسجّلة').toBe(8);
    for (const e of hides) {
      const [[file]] = cited(e.evidence);
      expect(file, `${e.location}: hide برّا الشاشات`).toMatch(/^src\/components\/screens\//);
      expect(readFileSync(join(ROOT, file), 'utf8'), `${file} ما فيه AdvancedGroup`).toContain('<AdvancedGroup');
    }
  });

  it('leaves every enforced-but-ungranted permission key to the owner: keep, never hide or merge', () => {
    const keys = entries.filter((e) => e.kind === 'permission-key');
    expect(keys.length).toBe(14);
    for (const e of keys) {
      expect(e.safeAction, `${e.location}: قرار المالك صار ${e.safeAction}`).toBe('keep');
      expect(e.reason).toContain('ينتظر قرار المالك');
    }
  });

  it('never merges a money screen, and keeps the deletion candidate on disk until the owner says delete', () => {
    for (const e of entries) {
      if (e.evidence.includes('/finance/')) expect(e.safeAction, `${e.location}: شاشة مال انعرضت للدمج`).not.toBe('merge');
    }
    const old = entries.find((e) => e.location === 'scripts/analytics-old.ts');
    expect(old?.safeAction).toBe('keep');
    expect(existsSync(join(ROOT, 'scripts/analytics-old.ts')), 'انحذف قبل كلمة المالك').toBe(true);
  });
});
