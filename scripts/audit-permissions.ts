/**
 * Reconciles the permissions UI against what the system actually enforces.
 *
 *   npx tsx scripts/audit-permissions.ts
 *
 * Two failures this catches, both of which make the permissions screen lie:
 *
 *   DEAD   — listed in the catalogue but nothing anywhere checks it. Ticking
 *            the box changes nothing, which is worse than the box not being
 *            there: it reads as a granted capability.
 *
 *   HIDDEN — enforced somewhere but absent from the catalogue, so nobody can
 *            grant it through the UI at all.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSION_MODULES } from '../src/lib/permission-catalog';
import { ALL_ROUTES } from '../src/lib/route-registry';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const files = walk(SRC);
const enforced = new Set<string>();

// Every way the code asks whether somebody may do something.
const PATTERNS = [
  /requirePermission\(\s*['"]([a-z_]+\.[a-z_]+)['"]/g,
  /\bcan\(\s*\w+\s*,\s*['"]([a-z_]+\.[a-z_]+)['"]/g,
  /\bhasPermission\(\s*\w+\s*,\s*['"]([a-z_]+\.[a-z_]+)['"]/g,
  // authorize() is the object-scoped check — it decides per record, so it is
  // just as much an enforcement point as the blanket ones.
  /\bauthorize\(\s*\w+\s*,\s*['"]([a-z_]+\.[a-z_]+)['"]/g,
  // A screen hiding what it may not do still means the key is live.
  /permissions\?\.includes\(\s*['"]([a-z_]+\.[a-z_]+)['"]/g,
];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) enforced.add(match[1]);
  }
}

// Routes guard themselves through the registry rather than a call.
for (const route of ALL_ROUTES) {
  for (const key of route.permissions ?? []) enforced.add(key);
}

// A legacy key that aliases onto a canonical one keeps that one alive.
const auth = readFileSync(join(SRC, 'lib', 'authorization.ts'), 'utf8');
for (const match of auth.matchAll(/['"]([a-z_]+\.[a-z_]+)['"]\s*:\s*['"]([a-z_]+\.[a-z_]+)['"]/g)) {
  if (enforced.has(match[1])) enforced.add(match[2]);
}

const catalogued = new Map<string, string>();
for (const mod of PERMISSION_MODULES) {
  for (const item of mod.items) catalogued.set(item.key, mod.module);
}

const dead = [...catalogued.keys()].filter((k) => !enforced.has(k)).sort();
const hidden = [...enforced].filter((k) => !catalogued.has(k)).sort();

console.log(`الكتالوج: ${catalogued.size} صلاحية · المفروضة فعلياً: ${enforced.size}\n`);

if (dead.length) {
  console.log(`✗ معروضة ولا شيء يفحصها (${dead.length}) — منحها لا يفعل شيئاً:`);
  for (const key of dead) console.log(`   ${key.padEnd(32)} [${catalogued.get(key)}]`);
  console.log();
}

if (hidden.length) {
  console.log(`✗ مفروضة ولا يمكن منحها من الشاشة (${hidden.length}):`);
  for (const key of hidden) console.log(`   ${key}`);
  console.log();
}

if (!dead.length && !hidden.length) console.log('✓ الشاشة مطابقة لما يفرضه النظام');

process.exit(dead.length || hidden.length ? 1 : 0);
