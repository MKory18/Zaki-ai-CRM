import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { restoreImages } from '../../scripts/sehha/restore';
import { CATALOG } from '../../scripts/sehha/catalog';

/**
 * «رجّع صور صحة بلس على نفس روابطها».
 *
 * Every deploy wiped `/app/uploads` (no persistent storage), so the rows `apply-sehha` wrote point at files that
 * are gone. The bytes are back at the EXACT key each row names — no new row, no new link — and only where nothing
 * is there, and only when they are the very bytes that row recorded.
 */

const IMAGES = path.join(process.cwd(), 'scripts', 'sehha', 'images');
const STORE = { id: 'st1', companyId: 'co1', name: 'متجر صحة بلس' };
let uploads: string;

const size = (key: string, which: string) => fs.statSync(path.join(IMAGES, key, `${which}.webp`)).size;
const keyOf = (productId: string, n: number) => `companies/co1/products/${productId}/${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000.webp`;

/** The rows apply-sehha left: cover + each poster, with the size of the bytes it uploaded. */
function rowsFor(productId: string, over: (r: { altText: string; storageKey: string; fileSize: number }) => object = () => ({})) {
  const item = CATALOG.find((c) => `prod-${c.sku}` === productId)!;
  return ['cover', ...item.posters.map(String)].map((which, i) => {
    const r = { altText: `sehha:${item.key}:${which}`, storageKey: keyOf(productId, i + 1), fileSize: size(item.key, which) };
    return { ...r, ...over(r) };
  });
}

function fake(opts: { stores?: unknown[]; rows?: (productId: string) => object[] } = {}) {
  const db = {
    store: { findMany: vi.fn(async () => opts.stores ?? [STORE]) },
    product: { findFirst: vi.fn(async ({ where }: { where: { sku: string } }) => ({ id: `prod-${where.sku}` })) },
    productImage: {
      findMany: vi.fn(async ({ where }: { where: { productId: string } }) => (opts.rows ?? rowsFor)(where.productId)),
    },
  };
  return db as unknown as PrismaClient;
}

const run = (db: PrismaClient, apply: boolean) => restoreImages({ db, imagesDir: IMAGES, uploadsDir: uploads, log: () => undefined }, { apply });
const total = CATALOG.reduce((n, c) => n + 1 + c.posters.length, 0);

beforeEach(() => {
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
});
afterEach(() => fs.rmSync(uploads, { recursive: true, force: true }));

describe('restoring the sehha pictures', () => {
  it('a dry run writes nothing, and counts what it would bring back', async () => {
    const r = await run(fake(), false);
    expect(r.restored).toHaveLength(total);
    expect(fs.readdirSync(uploads)).toEqual([]);
  });

  it('--apply puts the very same bytes back at the key each row names', async () => {
    const r = await run(fake(), true);
    expect(r.restored).toHaveLength(total);
    const item = CATALOG[0];
    const back = fs.readFileSync(path.join(uploads, keyOf(`prod-${item.sku}`, 1)));
    expect(back.equals(fs.readFileSync(path.join(IMAGES, item.key, 'cover.webp')))).toBe(true);
  });

  it('runs twice and the second run writes nothing — everything is present', async () => {
    await run(fake(), true);
    const again = await run(fake(), true);
    expect(again.restored).toEqual([]);
    expect(again.present).toHaveLength(total);
  });

  it('NEGATIVE: never writes over a file that is there', async () => {
    const item = CATALOG[0];
    const target = path.join(uploads, keyOf(`prod-${item.sku}`, 1));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'owner-uploaded');
    await run(fake(), true);
    expect(fs.readFileSync(target, 'utf8')).toBe('owner-uploaded');
  });

  it('NEGATIVE: bytes whose size differs from the row are not written — they are not the file that row recorded', async () => {
    const r = await run(fake({ rows: (p) => rowsFor(p, (x) => ({ fileSize: x.fileSize + 1 })) }), true);
    expect(r.restored).toEqual([]);
    expect(r.warnings).toHaveLength(total);
    expect(fs.readdirSync(uploads)).toEqual([]);
  });

  it('NEGATIVE: a key that leaves the uploads folder is refused', async () => {
    const r = await run(fake({ rows: (p) => rowsFor(p, () => ({ storageKey: '../outside.webp' })) }), true);
    expect(r.restored).toEqual([]);
    expect(fs.existsSync(path.join(uploads, '..', 'outside.webp'))).toBe(false);
  });

  it('NEGATIVE: no matching store, or two, stops before anything is written', async () => {
    for (const stores of [[], [STORE, { ...STORE, id: 'st2' }]]) {
      await expect(run(fake({ stores }), true)).rejects.toThrow(/بالضبط/);
    }
    expect(fs.readdirSync(uploads)).toEqual([]);
  });
});
