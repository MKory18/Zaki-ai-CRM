/**
 * WHERE «A MODEL ON MY OWN SERVER» IS ALLOWED TO POINT.
 *
 * The owner's note: «وإذا بدي أحمّل نموذج محلي ع السيرفر مستقبلاً». Honouring
 * it means one new setting — a base URL the server will POST to — and that
 * single text box is the most dangerous field in this product.
 *
 * WHAT IT CAN BE ABUSED FOR, said plainly, because the mitigation only makes
 * sense against the attack:
 *
 *   EXFILTRATION. Every AI call carries a prompt, and the prompts in this
 *   system carry customer names, phone numbers, addresses, order amounts and
 *   the company's own figures. Anybody who can reach the settings screen and
 *   type a URL can have the SERVER — not their own browser, the server, with
 *   its network position and its outbound allowances — send all of that to a
 *   host they control, one request at a time, for as long as nobody notices.
 *   There is no download, no export, no audit of a bulk read: it looks like
 *   the AI working.
 *
 *   THE CLOUD METADATA SERVICE. `http://169.254.169.254/` answers only to
 *   requests made from inside the instance, and on a default AWS, GCP or
 *   Azure box it hands out the machine's own IAM credentials. A base-URL box
 *   with no rules turns "configure your local model" into "read the server's
 *   cloud keys", and the reply comes back rendered on the settings screen by
 *   the connection test.
 *
 *   THE PRIVATE NETWORK. The server can reach things the internet cannot —
 *   an admin panel on another port, a database's HTTP interface, another
 *   tenant's service. A URL box is a request forger sitting inside the
 *   perimeter (SSRF), and the connection test makes it interactive.
 *
 * SO THE RULE IS THE OPPOSITE OF A BLOCKLIST. A blocklist of "bad" hosts is
 * a list somebody gets around; this refuses everything and then names what is
 * allowed: the loopback address, the private ranges a second machine in the
 * same rack would live on, and names an operator explicitly allowed in the
 * ENVIRONMENT — which takes shell access, not a settings form. A public
 * address is refused outright, because «محلي» does not mean "on the
 * internet", and if it is on the internet it is a vendor and belongs behind a
 * vendor's entry with a vendor's key.
 *
 * Pure, and tested, because a rule about what the server may dial is not a
 * rule anybody should have to re-derive while reading a route.
 */

export type EndpointRefusal =
  | 'EMPTY'
  | 'MALFORMED'
  | 'SCHEME'
  | 'CREDENTIALS'
  | 'METADATA'
  | 'PUBLIC';

export type HostKind = 'loopback' | 'private' | 'linklocal' | 'public';

export interface EndpointOk {
  ok: true;
  /** The address as it will be stored: no trailing slash, no fragment, no query. */
  url: string;
  host: string;
  kind: Extract<HostKind, 'loopback' | 'private'> | 'allowlisted';
}

export interface EndpointRefused {
  ok: false;
  code: EndpointRefusal;
  /** What is wrong and what to do, in the reader's own words. */
  message: string;
}

export type EndpointCheck = EndpointOk | EndpointRefused;

const refuse = (code: EndpointRefusal, message: string): EndpointRefused => ({ ok: false, code, message });

/** Each octet of a dotted-quad, or null when it is not one. */
function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map((n) => Number(n));
  // `01.02.03.04` and `999.1.1.1` are not addresses. Anything this does not
  // recognise falls through to `public`, which is refused — fail closed.
  if (parts.some((n) => n > 255)) return null;
  if (m.slice(1).some((s) => s.length > 1 && s.startsWith('0'))) return null;
  return parts;
}

/**
 * WHICH NETWORK A HOST BELONGS TO.
 *
 * Anything unrecognised is `public`, and public is refused — a decimal-encoded
 * address (`http://2130706433/` is 127.0.0.1) or a name this cannot resolve
 * lands there and is turned away rather than guessed at.
 */
export function classifyHost(rawHost: string): HostKind {
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return 'public';

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) is an IPv4 destination wearing a
  // different spelling, and must be judged as the address it actually dials.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (mapped) return classifyHost(mapped[1]);

  /**
   * AND THE SAME ADDRESS IN HEXADECIMAL.
   *
   * `new URL('http://[::ffff:169.254.169.254]/')` normalises the host to
   * `[::ffff:a9fe:a9fe]` — the metadata address, written in a form the
   * dotted-quad branch above does not recognise. It fell through to `public`
   * and was refused, so nothing was ever let through; but it was refused as
   * "not on your network" when the truthful answer is "that is the cloud
   * metadata service". Decoded here so the refusal names what it found.
   */
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hexMapped) {
    const n = (parseInt(hexMapped[1], 16) << 16) | parseInt(hexMapped[2], 16);
    return classifyHost([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }

  if (host === '::1') return 'loopback';
  // Unique-local (fc00::/7) is IPv6's private range; fe80::/10 is its
  // link-local, which is where the metadata service lives on some clouds.
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return 'private';
  if (/^fe[89ab][0-9a-f]:/.test(host)) return 'linklocal';

  const v4 = ipv4(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 127) return 'loopback';
    // 169.254.0.0/16 — the cloud metadata range. Named separately from
    // `public` so the refusal can say why rather than «ليس محلياً».
    if (a === 169 && b === 254) return 'linklocal';
    if (a === 10) return 'private';
    if (a === 172 && b >= 16 && b <= 31) return 'private';
    if (a === 192 && b === 168) return 'private';
    // RFC 6598 shared address space — where a WireGuard or Tailscale peer
    // sits. Not routable on the public internet, so a second machine of the
    // owner's can legitimately live here.
    if (a === 100 && b >= 64 && b <= 127) return 'private';
    return 'public';
  }

  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  // Names that cannot exist on the public internet by definition.
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return 'private';

  return 'public';
}

/**
 * The hosts an operator has allowed by hand, from the environment.
 *
 * Deliberately NOT a setting: adding one takes shell access to the server,
 * which is a different and much smaller set of people than "can open the
 * settings screen". The escape hatch exists — a model behind a reverse proxy
 * on a real name is a real deployment — but taking it is an act of
 * administration, not a text box.
 */
export function allowedHosts(env: Record<string, string | undefined> = process.env): string[] {
  return (env.AI_LOCAL_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Check and normalise a local model's address.
 *
 * `allowed` is passed rather than read so the rule is pure and a test does
 * not have to mutate the process environment to describe a deployment.
 */
export function parseLocalEndpoint(raw: string | null | undefined, allowed: string[] = []): EndpointCheck {
  const text = (raw ?? '').trim();
  if (!text) {
    return refuse('EMPTY', 'اكتب عنوان الخادم الذي يشغّل النموذج — مثال: http://localhost:11434');
  }

  const badAddress = refuse(
    'MALFORMED',
    'العنوان غير صالح — اكتبه كاملاً مع البروتوكول والمنفذ، مثال: http://localhost:11434'
  );

  /**
   * «localhost:11434» PARSES, AND NOT AS AN ADDRESS.
   *
   * `new URL('localhost:11434')` succeeds with the protocol `localhost:` and
   * an empty host — so the commonest way to type this box wrong would have
   * been turned away with «لا يُقبل إلا http أو https», which is true and
   * tells the reader nothing about what they actually forgot.
   */
  if (!text.includes('://')) return badAddress;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return badAddress;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // file:, gopher:, ftp: and friends are how a fetch is turned into a file
    // read or a protocol the server was never meant to speak.
    return refuse('SCHEME', 'لا يُقبل إلا http أو https.');
  }

  if (url.username || url.password) {
    // A secret in a URL ends up in every log line that records the address.
    return refuse('CREDENTIALS', 'لا تضع اسم مستخدم أو كلمة مرور داخل العنوان — ضع المفتاح في خانة المفتاح.');
  }

  const host = url.hostname.toLowerCase();
  const kind = classifyHost(host);

  if (allowed.includes(host)) {
    return { ok: true, url: normalise(url), host, kind: 'allowlisted' };
  }

  if (kind === 'linklocal') {
    return refuse(
      'METADATA',
      'هذا النطاق محجوز لخدمة بيانات الخادم عند مزوّد الاستضافة، وليس عنوان نموذج — مرفوض.'
    );
  }

  if (kind === 'public') {
    return refuse(
      'PUBLIC',
      'العنوان ليس على شبكتك — النموذج المحلي يكون على الخادم نفسه أو على شبكتك الداخلية. مزوّد على الإنترنت يُضاف كمزوّد بمفتاحه.'
    );
  }

  return { ok: true, url: normalise(url), host, kind };
}

/**
 * The address as it is stored.
 *
 * Query and fragment are dropped: they are not part of where a server lives,
 * and carrying them would let a saved address smuggle parameters onto every
 * request the system makes afterwards.
 */
function normalise(url: URL): string {
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

/**
 * The chat endpoint of a local server.
 *
 * Ollama, vLLM and LM Studio all speak the OpenAI chat-completions shape at
 * `/v1/chat/completions`, which is why the local provider needs no adapter of
 * its own. An operator who has already typed the full path keeps it, because
 * a gateway in front of the model may well serve it somewhere else.
 */
export function chatCompletionsUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  if (/\/v\d+$/.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}
