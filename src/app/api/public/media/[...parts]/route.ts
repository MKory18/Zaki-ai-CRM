import { NextResponse } from 'next/server';
import { isSafeStorageKey, readStoredFile } from '@/lib/storage';
import { verifyPreviewToken } from '@/lib/landing-pages';
import { PUBLIC_MEDIA_FILE } from '@/lib/public-media';
import { publicMediaCompany } from '@/lib/public-media-server';
import { IMAGE_WIDTHS } from '@/lib/responsive-image';

interface Ctx {
  params: Promise<{ parts: string[] }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => new NextResponse('Not found', { status: 404 });

/**
 * GET /api/public/media/<owner>/<file>
 * GET /api/public/media/<page>/<owner>/<file>
 *
 * Public (no sign-in): the images of the public pages — product photos on a
 * storefront, and whatever a landing page shows. /api/media needs a session
 * a shopper does not have. Which images are public, and when, is
 * publicMediaCompany's rule; everything else is a 404 that does not say
 * whether the file exists.
 *
 * The storage key is built on the server from the owner's row — the URL
 * never carries a company id — like the store-logo route.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { parts } = await ctx.params;
  if (parts.length !== 2 && parts.length !== 3) return NOT_FOUND();
  const via = parts.length === 3 ? parts[0] : null;
  const [owner, file] = parts.slice(-2);
  if ((via !== null && !UUID.test(via)) || !UUID.test(owner) || !PUBLIC_MEDIA_FILE.test(file)) return NOT_FOUND();

  const token = new URL(req.url).searchParams.get('p');
  const preview = token ? await verifyPreviewToken(token) : null;

  const companyId = await publicMediaCompany({
    owner: owner.toLowerCase(),
    file,
    via: via?.toLowerCase() ?? null,
    previewPageId: preview?.lpId ?? null,
  });
  if (!companyId) return NOT_FOUND();

  const storageKey = `companies/${companyId}/products/${owner.toLowerCase()}/${file}`;
  if (!isSafeStorageKey(storageKey)) return NOT_FOUND();

  const stored = await readStoredFile(storageKey);
  if (!stored) return NOT_FOUND();

  /**
   * A NARROWER RENDER, WHEN ONE WAS ASKED FOR.
   *
   * Every stored photograph is a WebP capped at 1200px, and a shelf on a
   * 360px phone draws twelve of them at about 165px each. Without this the
   * browser downloads the full picture twelve times and throws away nine
   * tenths of every one.
   *
   * THE WIDTH MUST BE ON THE LIST. `?w=` on a public route that runs a
   * resizer is otherwise a way to ask one server for a thousand renders of
   * one file. An unknown width is not refused — it falls through to the
   * original, so a stale link still shows the picture.
   *
   * A FAILED RESIZE SERVES THE ORIGINAL. sharp is an optional native
   * dependency; if it cannot load, a shop shows heavier images, not none.
   * The same decision the upload pipeline already makes.
   */
  const asked = Number(new URL(req.url).searchParams.get('w'));
  const width = (IMAGE_WIDTHS as readonly number[]).includes(asked) ? asked : null;
  if (width) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of stored.stream) chunks.push(chunk as Buffer);
      const sharpModule = await import('sharp').then((m) => m.default ?? m);
      const out = await sharpModule(Buffer.concat(chunks))
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return new NextResponse(new Uint8Array(out), {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(out.length),
          // The same day as the original, and for the same reason: a
          // public image may stop being public.
          'Cache-Control': preview ? 'private, no-store' : 'public, max-age=86400',
          Vary: 'Accept',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    } catch (e) {
      console.warn('resize skipped, serving the original:', e);
      const again = await readStoredFile(storageKey);
      if (!again) return NOT_FOUND();
      stored.stream = again.stream;
    }
  }

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
      // A draft's images must not outlive the preview in a shared cache; a
      // public one may stop being public (a page unpublished), so a day.
      'Cache-Control': preview ? 'private, no-store' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      // The policy that reaches the browser is next.config's
      // PUBLIC_MEDIA_HEADERS — Next drops a route's same-named header in
      // favour of the config's. Repeated here so the two cannot drift.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
