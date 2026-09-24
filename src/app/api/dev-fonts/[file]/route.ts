import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * FONTS THIS MACHINE MAY USE AND THIS SITE MAY NOT SERVE.
 *
 * Most Arabic type — thmanyah, Boutros, BigVesta, RAOOF — is licensed the
 * same way: you may use it on your own devices and in your own design work,
 * and you may not put the file anywhere a third party can fetch it. A
 * `@font-face` in a published page is exactly that second thing, which is
 * why those faces cannot ship.
 *
 * But a seller still needs to SEE the face before deciding to license it,
 * and reading a specimen on a foundry's website is not the same as watching
 * it set your own headline at your own sizes on your own page.
 *
 * So the files live outside `public/` and outside git, and this route hands
 * them to the browser in development only. Not by convention — by
 * construction: a production build answers 404 and there is no code path
 * that can be talked into doing otherwise.
 *
 * The moment a licence arrives in writing, the files move to `public/fonts`
 * and the registry entry changes one word. Nothing else has to change.
 */

const DIR = 'fonts-local';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  // The whole point of the route. First line, before anything is read.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  const { file } = await ctx.params;

  // A name, not a path. `..` and separators are not "sanitised" out — a
  // name containing them is simply not a name this route answers to.
  if (!/^[a-z0-9-]{1,64}\.woff2$/.test(file)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = await readFile(path.join(process.cwd(), DIR, file));
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'font/woff2',
        // Never a shared cache: this is one machine's private copy, and a
        // proxy holding it would be the leak the licence forbids.
        'Cache-Control': 'private, max-age=3600',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch {
    // A missing file and a forbidden name answer identically.
    return new NextResponse(null, { status: 404 });
  }
}
