import type { CourierAdapter } from './types';
import { manualAdapter } from './manual';
import { logesTechsFromEnv } from './logestechs';

/**
 * Adapter registry, keyed by DeliveryProvider.code.
 *
 * A provider with no registered adapter — or one whose `apiEnabled` is off —
 * is handled manually. That is the default on purpose: an integration starts
 * working only when someone deliberately turns it on for that provider.
 */
const ADAPTERS = new Map<string, CourierAdapter>([[manualAdapter.code, manualAdapter]]);

// LogesTechs registers itself only when its credentials are configured.
// Without them there is nothing to call, so the provider stays manual
// rather than failing at the first request.
const logesTechs = logesTechsFromEnv();
if (logesTechs) ADAPTERS.set(logesTechs.code, logesTechs);

export function registerAdapter(adapter: CourierAdapter): void {
  ADAPTERS.set(adapter.code.toUpperCase(), adapter);
}

export function adapterFor(provider: { code: string; apiEnabled?: boolean } | null | undefined): CourierAdapter {
  if (!provider?.apiEnabled) return manualAdapter;
  return ADAPTERS.get(provider.code.trim().toUpperCase()) ?? manualAdapter;
}

export function isAutomated(provider: { code: string; apiEnabled?: boolean } | null | undefined): boolean {
  return adapterFor(provider).automated;
}

export * from './types';
export { manualAdapter };
export { LogesTechsAdapter, LOGESTECHS_STATUS, LOGESTECHS_STATUS_AR } from './logestechs';
