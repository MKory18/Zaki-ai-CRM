/**
 * Shared client-safe config mirrors (must match src/lib/order-locks.ts defaults).
 * Kept separate from server code so client bundles never import server modules.
 */
export const LOCK_CONFIG = {
  lockDurationMs: 5 * 60 * 1000,
  heartbeatIntervalMs: 45 * 1000,
} as const;
