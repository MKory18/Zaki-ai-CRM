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

  // Prisma known errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return { body: { error: 'Duplicate record', code: 'DUPLICATE' }, status: 409 };
    }
    if (error.code === 'P2025') {
      return { body: { error: 'Record not found', code: 'NOT_FOUND' }, status: 409 };
    }
  }

  if (/version|conflict/i.test(message)) {
    return { body: { error: message }, status: 409 };
  }
  if (/not.?found/i.test(message)) {
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
