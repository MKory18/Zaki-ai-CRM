import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THE SYSTEM'S LOOK NEVER REACHES A SHOP, AND A SHOP'S NEVER THE SYSTEM.
 *
 * Every page used to render under the dashboard's stylesheet, fonts, title
 * and icon, so a seller's landing page wore the dashboard's heading colour
 * and grey background. The system's look now loads with the system's pages
 * only, its colours are --sys-*, and a store's are --lp-*. Asserted by
 * reading the files, because the failure worth catching is a well-meant
 * import or variable that crosses the line.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** The code only: a comment may name the other family to explain the line. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function files(dir: string, ext = /\.(tsx?|css)$/): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...files(rel, ext));
    else if (ext.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const STORE_FILES = [
  ...files('src/components/landing'),
  ...files('src/components/storefront'),
  ...files('src/components/public'),
  'src/lib/landing-theme.ts',
  'src/lib/block-look.ts',
];

const SYSTEM_FILES = ['src/app/(system)/system.css', 'src/app/globals.css', ...files('src/components/shell')];

describe('the two variable families', () => {
  it.each(STORE_FILES)('%s uses no system variable', (file) => {
    expect(code(file)).not.toMatch(/--sys-/);
  });

  it.each(SYSTEM_FILES)('%s uses no store variable', (file) => {
    expect(code(file)).not.toMatch(/--lp-/);
  });
});

describe('what every page loads', () => {
  it('the shared stylesheet sets no colour, background or font on anything', () => {
    const css = read('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/(^|[;{\s])(color|background(-color)?|font-family)\s*:/);
  });

  it('the root layout loads nothing of the system’s — no stylesheet, fonts, title or icon', () => {
    const root = read('src/app/layout.tsx');
    expect(root).not.toMatch(/system\.css|next\/font|metadata|AppProvider/);
  });

  it.each(['src/app/lp/layout.tsx', 'src/app/s/layout.tsx', 'src/components/public/PublicLayout.tsx'])(
    '%s dresses nothing in the system’s look',
    (file) => {
      expect(read(file)).not.toMatch(/system\.css|\(system\)|next\/font|AppProvider/);
    }
  );

  it('the system layout is where the system’s look is', () => {
    expect(read('src/app/(system)/SystemFrame.tsx')).toMatch(/import '\.\/system\.css'/);
    expect(read('src/app/(system)/layout.tsx')).toMatch(/SystemFrame/);
  });
});

describe('the framework default icon', () => {
  it('is gone — a public page carries its store’s icon or none, never someone else’s', () => {
    expect(() => statSync(join(ROOT, 'src/app/favicon.ico'))).toThrow();
  });
});
