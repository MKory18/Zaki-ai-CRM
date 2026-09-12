/**
 * TELEGRAM OUTBOUND (reserved) — minimal send surface for later phases.
 * Phase 1 does not send messages from Zaki; the architecture allows adding
 * reply/photo/document flows on top of cloud-api.ts when needed. Any route
 * exposing these must require the `telegram.send`-equivalent RBAC key first
 * (not part of the phase-1 permission set by design).
 */
export { sendMessage } from './cloud-api';
