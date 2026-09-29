/**
 * Centralized API error → HTTP response mapper.
 *
 * Maps thrown errors (auth guards, RBAC guards, Prisma known errors)
 * to consistent { error, code? } bodies with correct status codes.
 * Unknown errors never leak internals — a generic Arabic-safe message
 * is returned instead, and the original error is logged server-side.
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export interface ApiErrorResult {
  body: { error: string; code?: string };
  status: number;
}

/**
 * ONLY A SENTENCE THIS CODEBASE WROTE MAY BE SHOWN TO A CALLER.
 *
 * Two of the branches below echo the error's own message, which is right
 * for `throw new Error('المحفظة غير موجودة')` and wrong for everything
 * else that happens to contain the same word. Measured, not feared: a
 * Prisma error whose text merely mentions «not found» came back whole, and
 * it carried
 *
 *   Invalid `prisma.order.findUnique()` invocation in
 *   C:\Users\…\src\lib\orders.ts:88:14
 *
 * — the absolute path of the server's source tree, the model and the
 * method, handed to a browser. An initialization error matched on the word
 * «version» and gave up the engine file and the Prisma version with it.
 *
 * Three signs, each of which a message we wrote never has: it came from a
 * Prisma class, it spans lines, or it holds a filesystem path.
 */
function ours(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name.startsWith('Prisma')) return false;
  const m = error.message;
  if (m.length > 200 || m.includes('\n')) return false;
  // `C:\…`, `/home/…`, `/var/…`, `/Users/…` — a path in a message meant for
  // a person is a leak whatever the rest of the sentence says.
  return !/[A-Za-z]:[\\/]{1,2}[A-Za-z]|(?:^|[\s(])\/(?:home|Users|var|opt|srv|app)\//.test(m);
}

export function apiError(error: unknown): ApiErrorResult {
  const message = error instanceof Error ? error.message : String(error);

  if (message === 'Unauthorized') {
    return { body: { error: 'Unauthorized' }, status: 401 };
  }
  if (/^ACCOUNT_/.test(message)) {
    return { body: { error: message }, status: 401 };
  }
  if (message.startsWith('Forbidden')) {
    return { body: { error: message }, status: 403 };
  }
  // Geo context missing (see lib/geo-context.ts requireContext)
  if (error instanceof Error && error.name === 'ContextError') {
    return { body: { error: message, code: (error as Error & { code: string }).code }, status: 400 };
  }

  // Prisma known errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return { body: { error: 'Duplicate record', code: 'DUPLICATE' }, status: 409 };
    }
    if (error.code === 'P2025') {
      return { body: { error: 'Record not found', code: 'NOT_FOUND' }, status: 409 };
    }
  }

  if (ours(error) && /version|conflict/i.test(message)) {
    return { body: { error: message }, status: 409 };
  }
  if (ours(error) && /not.?found/i.test(message)) {
    return { body: { error: message }, status: 404 };
  }

  console.error(error);
  return { body: { error: 'حدث خطأ داخلي' }, status: 500 };
}

/**
 * Convenience wrapper for catch blocks: maps the error via apiError() and
 * returns a ready-to-send NextResponse. In development the original error
 * message is attached as `detail` for debugging; in production it is
 * omitted entirely so internals (Prisma messages, stack traces) never leak.
 * A 500 also logs the original error server-side (via apiError).
 */
export function apiErrorResponse(error: unknown): NextResponse {
  const { body, status } = apiError(error);
  const devDetail =
    process.env.NODE_ENV !== 'production' && error instanceof Error
      ? { detail: error.message }
      : {};
  return NextResponse.json({ ...body, ...devDetail }, { status });
}
