import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readStoredFile, isSafeStorageKey } from '@/lib/storage';

/**
 * GET /api/media/companies/{companyId}/products/{productId}/{file}
 * Streams stored media with strict tenant isolation: authenticated ACTIVE users
 * can only access their own company's namespace (SUPER_ADMIN: any).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  let decoded: string[];
  try {
    decoded = key.map((k) => decodeURIComponent(k));
  } catch {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
  }

  // Reject traversal payloads before joining: backslash separators, dot
  // segments and dot-prefixed names can escape the per-company namespace.
  if (decoded.some((s) => s.includes('\\') || s === '.' || s === '..' || s.startsWith('.'))) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
  }
  const storageKey = decoded.join('/');

  // Path structure: companies/{companyId}/products/{productId}/{file}
  const parts = storageKey.split('/');
  if (parts.length !== 5 || parts[0] !== 'companies' || parts[2] !== 'products') {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
  }

  const companyId = parts[1];
  if (user.role !== 'SUPER_ADMIN' && user.companyId !== companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Canonical containment check (defense in depth with readStoredFile's guard)
  if (!isSafeStorageKey(storageKey)) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
  }

  const file = await readStoredFile(storageKey);
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Convert Node stream to web stream
  const webStream = new ReadableStream({
    start(controller) {
      file.stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      file.stream.on('end', () => controller.close());
      file.stream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
