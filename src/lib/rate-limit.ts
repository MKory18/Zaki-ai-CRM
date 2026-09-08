/**
 * Simple in-memory sliding-window rate limiter.
 * For single-instance deployments (Next.js standalone). Swap with Redis for clusters.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref?.();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

export function getClientIp(req: Request): string {
  // Only trust proxy headers when the deployment explicitly sits behind a
  // trusted reverse proxy (Coolify) that sets TRUST_PROXY=true. Without it,
  // x-forwarded-for / x-real-ip are client-spoofable and must be ignored.
  if (process.env.TRUST_PROXY === 'true') {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'local';
  }
  // Next.js route handlers do not expose the raw socket IP. Without a
  // trusted proxy every client therefore shares one conservative bucket
  // ('local') — a deliberate SAFE default for an internet-exposed single
  // node: rate limits cannot be bypassed by header spoofing.
  return 'local';
}
