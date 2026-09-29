/*
 * THE SHIPPABLE FOLDER.
 *
 * Collects the generated parts into `dist/`, writes the two «everything in
 * one file» bundles, and inlines the icon sprite into the demo.
 *
 * ── WHY THE BUNDLE IS NOT A MODULE ──
 *
 * `demo.html` has to open by double-click, and a browser refuses
 * `<script type="module">` over `file://` — and refuses an external SVG
 * `<use>` too. So the bundle is a classic script that hangs one object off
 * `window.zk`, and the sprite is inlined into the demo. Both are
 * consequences of «works with no server», which is the studio's whole
 * situation.
 *
 * The bundler is a concatenation: the sources are small, they have no
 * dependencies outside themselves, and a real bundler would be a tool the
 * studio's machine has to have.
 *
 * Run: node packages/zaki-ui/scripts/build-dist.mjs
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const DIST = join(PKG, 'dist');

export const VERSION = readFileSync(join(PKG, 'VERSION'), 'utf8').trim();

/** Order matters: tokens define what the rest reference. */
const CSS_ORDER = ['tokens.css', 'fonts.css', 'components.css', 'shell.css'];
const JS_ORDER = ['components.js', 'shell.js'];

/**
 * Turn the ES modules into one classic script.
 *
 * `import` lines are dropped because everything they import is being
 * concatenated in the same file, and `export` keywords are stripped for
 * the same reason. This is only safe because the modules import NOTHING
 * from outside the package — asserted here rather than assumed, since the
 * day somebody adds a dependency this would silently produce a broken
 * bundle.
 */
function flatten(source, file) {
  for (const m of source.matchAll(/^import\s+[^;]*?from\s+'([^']+)';$/gm)) {
    if (!m[1].startsWith('./')) throw new Error(`${file} imports from outside the package: ${m[1]}`);
  }
  return source
    .replace(/^import\s+[^;]*?from\s+'[^']+';$/gm, '')
    .replace(/^export\s+\{[^}]*\};$/gm, '')
    .replace(/^export\s+(const|function|class|async function)\s/gm, '$1 ');
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const f of [...CSS_ORDER, ...JS_ORDER, 'icons.svg', 'icons.json', 'tokens.json', 'README.md', 'LICENSES.md', 'VERSION', 'CHANGELOG.md', 'DECISIONS.md']) {
  copyFileSync(join(PKG, f), join(DIST, f));
}
cpSync(join(PKG, 'fonts'), join(DIST, 'fonts'), { recursive: true });

// ── one stylesheet ────────────────────────────────────────────────────
const css = CSS_ORDER.map((f) => `/* ── ${f} ── */\n${readFileSync(join(PKG, f), 'utf8')}`).join('\n\n');
writeFileSync(join(DIST, 'zaki-ui.all.css'), `/* zaki-ui ${VERSION} — tokens, fonts, components, shell. */\n\n${css}`, 'utf8');

// ── one script ────────────────────────────────────────────────────────
const js = JS_ORDER.map((f) => `/* ── ${f} ── */\n${flatten(readFileSync(join(PKG, f), 'utf8'), f)}`).join('\n\n');
const bundle = `/* zaki-ui ${VERSION} — components + shell, as one classic script.
 * Hangs everything off window.zk so a page with no bundler can use it:
 *   zk.toast('حُفظ', { tone: 'success' })
 */
(function (global) {
  'use strict';
${js}
  global.zk = Object.assign({}, ZK_COMPONENTS, ZK_SHELL);
})(typeof window !== 'undefined' ? window : globalThis);
`;
writeFileSync(join(DIST, 'zaki-ui.all.js'), bundle, 'utf8');

// ── the demo, with the sprite inlined ─────────────────────────────────
const sprite = readFileSync(join(PKG, 'icons.svg'), 'utf8')
  .replace(/^<\?xml[^>]*\?>\s*/, '')
  .replace(/^<!--[\s\S]*?-->\s*/, '');
const demo = readFileSync(join(PKG, 'demo.html'), 'utf8').replace('<!--ZK_SPRITE-->', sprite);
if (demo.includes('<!--ZK_SPRITE-->')) throw new Error('the sprite placeholder was not replaced');
writeFileSync(join(DIST, 'demo.html'), demo, 'utf8');

const listing = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => {
    const rel = join(e.parentPath ?? e.path ?? DIST, e.name).slice(DIST.length + 1).split('\\').join('/');
    return { file: rel, bytes: statSync(join(DIST, rel)).size };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

writeFileSync(join(DIST, 'MANIFEST.json'), JSON.stringify({ name: 'zaki-ui', version: VERSION, files: listing }, null, 2) + '\n', 'utf8');

const total = listing.reduce((n, f) => n + f.bytes, 0);
console.log(`dist/ — ${listing.length} files, ${Math.round(total / 1024)} KB`);
for (const f of listing) console.log(`  ${f.file.padEnd(42)} ${String(Math.round(f.bytes / 1024)).padStart(4)} KB`);
if (!existsSync(join(DIST, 'demo.html'))) throw new Error('no demo.html in dist');
