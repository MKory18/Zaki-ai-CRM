import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readStoredFile } from '@/lib/storage';
import { fontMime } from '@/lib/fonts/store-fonts';

interface Ctx {
  params: Promise<{ store: string; file: string }>;
}

/**
 * A store's uploaded face, served to its own public pages.
 *
 * Public by necessity — a landing page is read by people who are not logged
 * in, and a font their browser cannot fetch is a font that does not exist.
 *
 * What makes that safe is that nothing here trusts the URL. The store id
 * and the filename are looked up as a PAIR in the database, and the bytes
 * come from the storage key that row holds. A request naming another
 * store's font finds no row; a request naming a path finds no row. The
 * caller never chooses a path, so there is no traversal to defend against —
 * the only reachable files are ones a row already points at.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { store, file } = await ctx.params;

  // `<key>-<weight><n|i>.<format>`, and nothing else is a name we answer to.
  const m = /^([a-z0-9-]{1,40})-([1-9]00)([ni])\.(woff2|woff|otf|ttf)$/.exec(file);
  if (!m || !/^[0-9a-f-]{36}$/i.test(store)) {
    return new NextResponse(null, { status: 404 });
  }
  const [, key, weight, style, format] = m;

  const row = await db.storeFont.findFirst({
    where: {
      storeId: store,
      key,
      weight: Number(weight),
      italic: style === 'i',
      format,
    },
    select: { storageKey: true, format: true, sizeBytes: true },
  });
  if (!row) return new NextResponse(null, { status: 404 });

  const stored = await readStoredFile(row.storageKey);
  if (!stored) return new NextResponse(null, { status: 404 });

  const chunks: Buffer[] = [];
  for await (const chunk of stored.stream) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': fontMime(row.format),
      // A font file changes only by being re-uploaded, and a re-upload keeps
      // the same name — so a week is too long for a cache the seller cannot
      // bust. An hour is long enough that visitors are not re-downloading
      // it, and short enough that a replaced weight appears the same day.
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}
