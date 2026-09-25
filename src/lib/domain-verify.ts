import { createHmac } from 'node:crypto';
import { promises as dns } from 'node:dns';
import tls from 'node:tls';
import { normalizeHost } from './landing-domain';

/**
 * IS THIS DOMAIN ACTUALLY POINTED AT US, AND DOES IT ACTUALLY HAVE A
 * CERTIFICATE?
 *
 * Both questions are answered by LOOKING, never by a flag somebody set. A
 * «متحقَّق» badge that means "the seller pressed a button" is worse than no
 * badge: it is the screen telling them the shop is reachable while every
 * customer gets an error.
 *
 * TWO THINGS ARE CHECKED, AND THEY ARE NOT THE SAME THING.
 *
 *  1. OWNERSHIP — a TXT record at _zaki-verify.<domain> holding a token only
 *     this installation can compute. Anyone can point a DNS record at our
 *     address; this is what says the person configuring it holds the domain.
 *  2. ROUTING — the domain's A/AAAA/CNAME actually resolving to where this
 *     app answers. Ownership without routing is a verified domain that
 *     serves nothing.
 *
 * SSL is reported from a real TLS handshake, and "could not check" is a
 * distinct answer from "no certificate": the app server's own network may
 * refuse outbound connections, and that is not the seller's problem to fix.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: write DNS records, or buy a domain.
 * Both need a registrar's API and credentials nobody has given us. The
 * screen shows the values to set, with a copy button, and says plainly that
 * the seller sets them at whoever they bought the domain from — rather than
 * offering a "manage DNS" panel that cannot change anything.
 */

export const VERIFY_PREFIX = '_zaki-verify';

export type DomainStatus = 'PENDING' | 'VERIFIED' | 'FAILED';
export type SslStatus = 'VALID' | 'INVALID' | 'UNKNOWN';

export interface DomainCheck {
  status: DomainStatus;
  /** Why, in the seller's language — shown as-is. */
  detail: string;
  ownership: boolean;
  routing: boolean;
  ssl: SslStatus;
  sslDetail?: string;
  /** What the domain's records actually say right now. */
  found: { txt: string[]; a: string[]; cname: string[] };
  checkedAt: string;
}

/**
 * The token this domain must publish.
 *
 * Derived, not stored: an HMAC over the hostname keyed on the installation's
 * own secret. Nobody outside can compute it, and there is no column to keep
 * in step with the domain field.
 *
 * Rotating APP_ENCRYPTION_KEY changes every token, so a domain verified
 * before a rotation reads as PENDING until its record is updated. That is
 * the documented cost of not storing one, and rotation already invalidates
 * every courier password, so it is not a new kind of event.
 */
export function verifyToken(domain: string): string {
  const host = normalizeHost(domain) ?? domain.trim().toLowerCase();
  const key = process.env.APP_ENCRYPTION_KEY || 'development_only_insecure_domain_token_key';
  return createHmac('sha256', key).update(`domain:${host}`).digest('hex').slice(0, 32);
}

/** The TXT record name the seller creates. */
export function verifyRecordName(domain: string): string {
  const host = normalizeHost(domain) ?? domain.trim().toLowerCase();
  return `${VERIFY_PREFIX}.${host}`;
}

/**
 * Where a seller's domain must point.
 *
 * An A record needs an address, and only the deployment knows it, so
 * APP_DOMAIN is offered as a CNAME target when it is set — a CNAME survives
 * the server moving, which an address the seller typed does not. With
 * neither set the screen says it cannot tell them yet rather than inventing
 * a value that would take their shop off the air.
 */
export function routingTarget(): { kind: 'CNAME'; value: string } | { kind: 'A'; value: string } | null {
  const ip = process.env.APP_PUBLIC_IP?.trim();
  const domain = normalizeHost(process.env.APP_DOMAIN) ?? null;
  if (domain) return { kind: 'CNAME', value: domain };
  if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { kind: 'A', value: ip };
  return null;
}

/** The records a seller must create, ready to show with a copy button. */
export function requiredRecords(domain: string): { type: string; name: string; value: string; ttl: string }[] {
  const target = routingTarget();
  const records = [
    { type: 'TXT', name: verifyRecordName(domain), value: verifyToken(domain), ttl: '300' },
  ];
  if (target) {
    records.unshift({
      type: target.kind,
      name: normalizeHost(domain) ?? domain,
      value: target.value,
      ttl: '300',
    });
  }
  return records;
}

async function lookup(fn: () => Promise<string[]>): Promise<string[]> {
  try {
    return await fn();
  } catch {
    // A record that does not exist and a resolver that is briefly unhappy
    // both read as "nothing found"; the caller reports what is missing.
    return [];
  }
}

/** Whether the TLS the domain answers with is a certificate that covers it. */
export async function checkSsl(domain: string, timeoutMs = 6000): Promise<{ ssl: SslStatus; detail?: string }> {
  const host = normalizeHost(domain);
  if (!host) return { ssl: 'UNKNOWN' };
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: { ssl: SslStatus; detail?: string }) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* already gone */ }
      resolve(value);
    };
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      if (!socket.authorized) {
        done({ ssl: 'INVALID', detail: socket.authorizationError ? String(socket.authorizationError) : undefined });
        return;
      }
      done({ ssl: 'VALID', detail: cert?.valid_to ? `صالحة حتى ${cert.valid_to}` : undefined });
    });
    // A refused or unreachable port is NOT a missing certificate: the app
    // server's own network may forbid the call. Say so instead of guessing.
    socket.on('error', () => done({ ssl: 'UNKNOWN', detail: 'تعذّر الوصول إلى النطاق من الخادم للتحقّق' }));
    socket.on('timeout', () => done({ ssl: 'UNKNOWN', detail: 'انتهت مهلة الاتصال بالنطاق' }));
  });
}

/**
 * Look the domain up and say where it stands.
 *
 * VERIFIED needs BOTH ownership and routing. Anything less is reported with
 * which half is missing, because "failed" without that is a dead end for
 * somebody who has to go and edit DNS.
 */
export async function checkDomain(domain: string): Promise<DomainCheck> {
  const host = normalizeHost(domain);
  const checkedAt = new Date().toISOString();
  if (!host) {
    return {
      status: 'FAILED', detail: 'النطاق غير صالح', ownership: false, routing: false,
      ssl: 'UNKNOWN', found: { txt: [], a: [], cname: [] }, checkedAt,
    };
  }

  const [txtRaw, a, cname] = await Promise.all([
    lookup(async () => (await dns.resolveTxt(verifyRecordName(host))).map((parts) => parts.join(''))),
    lookup(() => dns.resolve4(host)),
    lookup(() => dns.resolveCname(host)),
  ]);

  const token = verifyToken(host);
  const ownership = txtRaw.some((value) => value.trim() === token);

  const target = routingTarget();
  const routing = !target
    ? false
    : target.kind === 'A'
      ? a.includes(target.value)
      : cname.some((c) => normalizeHost(c) === target.value);

  const { ssl, detail: sslDetail } = ownership && routing ? await checkSsl(host) : { ssl: 'UNKNOWN' as SslStatus, detail: undefined };

  let status: DomainStatus;
  let detail: string;
  if (ownership && routing) {
    status = 'VERIFIED';
    detail = 'النطاق موجَّه إليك ومُتحقَّق منه.';
  } else if (!target) {
    // Our own deployment has not been told where it lives. Not the seller's
    // fault, and not something they can fix by editing DNS.
    status = 'PENDING';
    detail = 'لم يُضبط عنوان التطبيق على الخادم (APP_DOMAIN أو APP_PUBLIC_IP) — لا يمكن إخبارك بالقيمة المطلوبة بعد.';
  } else if (!ownership && !routing) {
    status = 'PENDING';
    detail = 'لم يظهر أيّ من السجلّين بعد. انتظر بعد إضافتهما — قد يستغرق الانتشار ساعات.';
  } else if (!ownership) {
    status = 'PENDING';
    detail = `سجل TXT على ${verifyRecordName(host)} غير موجود أو قيمته مختلفة.`;
  } else {
    status = 'PENDING';
    detail =
      target.kind === 'CNAME'
        ? `سجل CNAME للنطاق لا يشير إلى ${target.value}.`
        : `سجل A للنطاق لا يشير إلى ${target.value}.`;
  }

  return { status, detail, ownership, routing, ssl, sslDetail, found: { txt: txtRaw, a, cname }, checkedAt };
}
