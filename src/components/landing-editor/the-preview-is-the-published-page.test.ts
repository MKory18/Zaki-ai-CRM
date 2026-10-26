import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The editor's preview must draw the page the visitor will see. Two things made it differ: the dashboard painted every
 * <strong> in its own heading colour (so the trust titles looked right in the editor and wrong on the page), and the
 * preview never wore the store's family (عيادة · عطّار · ترند), which the published page does.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the editor’s preview', () => {
  it('the dashboard’s <strong> colour stops at a seller’s page', () => {
    const css = read('src/app/(system)/system.css');
    expect(css).toContain('html[lang="ar"] strong:where(:not(.lp-root *))');
    expect(css).not.toMatch(/html\[lang="ar"\] strong \{/);
  });

  it('wears the store’s family, as the published page does', () => {
    expect(read('src/app/api/landing-pages/[id]/route.ts')).toContain('family: familyOf(parseStoreTheme(lp.store?.theme).template)');
    const builder = read('src/components/landing-editor/BlockBuilder.tsx');
    expect(builder).toContain('data-family={props.family ?? undefined}');
    expect(builder).toContain('family: props.family ?? undefined');
    expect(read('src/components/screens/LandingPageEditorScreen.tsx')).toContain('family={family}');
  });

  it('the pencil opens the fields pane on a phone', () => {
    const builder = read('src/components/landing-editor/BlockBuilder.tsx');
    const onEdit = builder.slice(builder.indexOf('onEdit: (id) => {'), builder.indexOf('onEdit: (id) => {') + 300);
    expect(onEdit).toContain("setPane('edit')");
  });

  it('NEGATIVE: the canvas clips without becoming a scroll container — the block bar’s sticky needs that', () => {
    const builder = read('src/components/landing-editor/BlockBuilder.tsx');
    expect(builder).toContain("overflow: 'clip'");
    expect(builder).not.toMatch(/className="lp-root overflow-hidden/);
  });
});
