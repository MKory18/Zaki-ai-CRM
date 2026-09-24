import { describe, it, expect } from 'vitest';
import { PAGE_TEMPLATES, buildTemplate } from './page-templates';
import { landingSectionsSchema, SECTION_LABEL, SINGLETON } from './landing-sections';
import { landingThemeSchema } from './landing-theme';

/**
 * A TEMPLATE THAT PRODUCES A PAGE THE SYSTEM REFUSES TO SAVE IS WORSE THAN
 * NO TEMPLATE.
 *
 * The seller picks one, loses the page they had, and then cannot save the
 * page they got. So every template is built and validated here, through the
 * same schema the save route uses — a broken one fails in this file rather
 * than on somebody's screen.
 *
 * And the other half: fifteen templates that are five blocks reordered are
 * one template offered fifteen times. The tests below assert they are
 * actually different, because "looks varied" is not something a type system
 * can check and is the whole reason the feature exists.
 */

describe('every template builds a page the system would accept', () => {
  it.each(PAGE_TEMPLATES.map((t) => [t.key, t.label] as const))('%s — %s', (key) => {
    const { sections, theme } = buildTemplate(key);
    expect(sections.length).toBeGreaterThan(0);
    // The same parse the save route runs. If this throws, the seller would
    // have seen "أقسام الصفحة غير صالحة" and lost their page for nothing.
    expect(() => landingSectionsSchema.parse(sections)).not.toThrow();
    expect(() => landingThemeSchema.parse(theme)).not.toThrow();
  });

  it('gives every page a way to take an order', () => {
    // A landing page without a form is a page that cannot sell. Whatever
    // else a template does, it must not produce one.
    for (const t of PAGE_TEMPLATES) {
      const { sections } = buildTemplate(t.key);
      expect(sections.some((s) => s.type === 'form' && s.enabled), t.key).toBe(true);
    }
  });

  it('never puts two of a block that may exist once', () => {
    for (const t of PAGE_TEMPLATES) {
      const { sections } = buildTemplate(t.key);
      for (const only of SINGLETON) {
        const n = sections.filter((s) => s.type === only).length;
        expect(n, `${t.key} has ${n} × ${SECTION_LABEL[only]}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives each block its own id', () => {
    for (const t of PAGE_TEMPLATES) {
      const { sections } = buildTemplate(t.key);
      expect(new Set(sections.map((s) => s.id)).size, t.key).toBe(sections.length);
    }
  });

  it('gives two pages from one template different ids', () => {
    // Otherwise two pages built from the same template would edit and
    // delete as a pair without saying so.
    const a = buildTemplate('classic').sections.map((s) => s.id);
    const bIds = buildTemplate('classic').sections.map((s) => s.id);
    expect(a.some((id) => bIds.includes(id))).toBe(false);
  });

  it('falls back to something usable for a key nobody has', () => {
    const { sections } = buildTemplate('no-such-template');
    expect(sections.some((s) => s.type === 'form')).toBe(true);
  });
});

describe('fifteen templates, and fifteen different pages', () => {
  it('offers fifteen', () => {
    expect(PAGE_TEMPLATES).toHaveLength(15);
  });

  it('gives each a key, a name, a hint and a colour of its own', () => {
    expect(new Set(PAGE_TEMPLATES.map((t) => t.key)).size).toBe(15);
    expect(new Set(PAGE_TEMPLATES.map((t) => t.label)).size).toBe(15);
    for (const t of PAGE_TEMPLATES) {
      expect(t.hint.length, t.key).toBeGreaterThan(10);
      expect(t.swatch, t.key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('does not simply reorder one set of blocks', () => {
    // The shapes must differ, not merely the sequence. Fourteen distinct
    // block-sets out of fifteen leaves room for the deliberate pair, and
    // catches the version of this feature that is a list sorted five ways.
    const shapes = PAGE_TEMPLATES.map((t) =>
      [...new Set(buildTemplate(t.key).sections.map((s) => s.type))].sort().join(',')
    );
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(12);
  });

  it('does not dress them all the same either', () => {
    // A seller who tries two and sees one page learns the feature is
    // decoration. Accent, font and mood each have to vary.
    const themes = PAGE_TEMPLATES.map((t) => buildTemplate(t.key).theme);
    expect(new Set(themes.map((t) => t.accent)).size).toBeGreaterThanOrEqual(12);
    expect(new Set(themes.map((t) => t.font)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(themes.map((t) => t.mood)).size).toBeGreaterThanOrEqual(3);
  });

  it('actually styles blocks, rather than leaving every page in the defaults', () => {
    // At least the ones that promise a look — the dark luxury page, the
    // black sports page — must carry a background their blocks did not
    // start with.
    const dressed = PAGE_TEMPLATES.filter((t) =>
      buildTemplate(t.key).sections.some((s) => s.look?.background?.kind !== 'none')
    );
    expect(dressed.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps every colour it sets to a real hex', () => {
    for (const t of PAGE_TEMPLATES) {
      for (const s of buildTemplate(t.key).sections) {
        for (const v of [
          s.look?.background?.from, s.look?.background?.to,
          s.look?.text?.color, s.look?.text?.headingColor,
          s.look?.button?.fill, s.look?.button?.label,
        ]) {
          if (v) expect(v, `${t.key}/${s.type}`).toMatch(/^#[0-9a-f]{3,8}$/i);
        }
      }
    }
  });

  it('asks only for fonts the library actually has', () => {
    // A template naming a font nobody can load renders in the fallback, and
    // the seller sees a page that does not look like its own preview.
    for (const t of PAGE_TEMPLATES) {
      const { theme } = buildTemplate(t.key);
      expect(landingThemeSchema.safeParse(theme).success, t.key).toBe(true);
    }
  });
});
