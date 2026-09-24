import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isSafeStorageKey, readStoredFile } from '@/lib/storage';
import { STORE_LOGO_FILE, storeLogoUrl } from '@/lib/store-logo';

interface Ctx {
  params: Promise<{ storeId: string; file: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/public/store-logo/[storeId]/[file]
 *
 * Public (no sign-in): a store's logo and favicon are shown to shoppers,
 * who have no session, so /api/media cannot serve them.
 *
 * Serves the store's CURRENT logo or favicon and nothing else. The store's
 * folder also holds whatever was uploaded before, and a public route that
 * served any file in it would publish every image ever replaced. The file
 * must be one Store.logo or Store.favicon names right now; everything else
 * is a 404, with no difference between "no such store" and "not its own".
 *
 * The storage key is built on the server from the store row — the URL never
 * carries a company id — mirroring the landing-page media route.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { storeId, file } = await ctx.params;
  if (!UUID.test(storeId) || !STORE_LOGO_FILE.test(file)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const store = await db.store.findFirst({
    where: { id: storeId },
    select: { id: true, companyId: true, logo: true, favicon: true },
  });
  const url = store ? storeLogoUrl(store.id, file) : null;
  if (!store || (store.logo !== url && store.favicon !== url)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const storageKey = `companies/${store.companyId}/products/${store.id}/${file}`;
  if (!isSafeStorageKey(storageKey)) return new NextResponse('Not found', { status: 404 });

  const stored = await readStoredFile(storageKey);
  if (!stored) return new NextResponse('Not found', { status: 404 });

  const body = new ReadableStream({
    start(controller) {
      stored.stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stored.stream.on('end', () => controller.close());
      stored.stream.on('error', () => controller.error());
    },
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': stored.mimeType,
      'Content-Length': String(stored.size),
      // The file name is a fresh uuid per upload, so a new logo is a new URL
      // and the old one may be cached for ever.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
