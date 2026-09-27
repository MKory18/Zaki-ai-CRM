import { createHash, createVerify, randomBytes, verify as cryptoVerify, createPublicKey } from 'node:crypto';

/**
 * THE FINGERPRINT ON THE DEVICE ALREADY IN THE HAND.
 *
 * A passkey stands in for the six-digit code. It does NOT stand in for the
 * password, and that is the whole shape of it: a phone that is picked up is
 * a second factor that is already lost, and the password is what keeps a
 * stolen phone from being an open account. «Bypass» here means bypassing
 * the typing, not the proof.
 *
 * WHY THERE IS NO LIBRARY, AND NO CBOR PARSER.
 *
 * A full WebAuthn server decodes the attestation object — CBOR, then a COSE
 * key, then a conversion to something a crypto library will take. Every one
 * of those steps is a parser standing in front of authentication, which is
 * the last place to hand-roll a parser.
 *
 * None of it is needed. The browser hands the public key over already
 * decoded: `AuthenticatorAttestationResponse.getPublicKey()` returns SPKI
 * DER and `getPublicKeyAlgorithm()` returns the COSE algorithm. So
 * registration stores what the browser gives, and a sign-in is one
 * signature check with Node's own crypto over bytes we assemble ourselves.
 * The whole surface is this file, and it is short enough to read.
 *
 * WHAT IS CHECKED, AND WHY EACH ONE MATTERS:
 *
 *   the challenge   ours, unspent, unexpired — or the signature is a replay
 *   the type        `webauthn.get`, so a registration cannot be replayed as
 *                   a sign-in
 *   the origin      ours exactly — this is what stops a look-alike site
 *                   collecting a signature and using it here
 *   the rpIdHash    ours — the same thing the authenticator itself enforced
 *   user present    the flag that means a human touched the device
 *   the counter     must advance, when the authenticator keeps one: a value
 *                   that repeats is what a cloned key produces
 *   the signature   over authenticatorData ‖ sha256(clientDataJSON)
 */

export const COSE_ES256 = -7;
export const COSE_RS256 = -257;
/** The algorithms we accept, in the order we prefer them. */
export const ALLOWED_ALGORITHMS = [COSE_ES256, COSE_RS256] as const;

/** A challenge is useless after this; a person does not take two minutes. */
export const CHALLENGE_TTL_MS = 120_000;

export const b64url = {
  encode(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Buffer {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
  },
};

export function newChallenge(): string {
  return b64url.encode(randomBytes(32));
}

/**
 * THE FLAGS AND THE COUNTER, out of authenticatorData.
 *
 * Its layout is fixed and tiny: 32 bytes of rpIdHash, one byte of flags,
 * four bytes of counter, then whatever else. Reading three fields at known
 * offsets is not parsing — there is nothing here to get lost in.
 */
export interface AuthData {
  rpIdHash: Buffer;
  userPresent: boolean;
  userVerified: boolean;
  counter: number;
}

export function readAuthData(data: Buffer): AuthData | null {
  if (data.length < 37) return null;
  const flags = data[32];
  return {
    rpIdHash: data.subarray(0, 32),
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    counter: data.readUInt32BE(33),
  };
}

export type PasskeyRefusal =
  | 'BAD_CLIENT_DATA'
  | 'WRONG_CEREMONY'
  | 'WRONG_CHALLENGE'
  | 'WRONG_ORIGIN'
  | 'WRONG_RP'
  | 'NO_USER_PRESENT'
  | 'BAD_AUTH_DATA'
  | 'COUNTER_REUSED'
  | 'BAD_SIGNATURE'
  | 'UNSUPPORTED_ALGORITHM';

export const REFUSAL_AR: Record<PasskeyRefusal, string> = {
  BAD_CLIENT_DATA: 'بيانات التوقيع غير مقروءة',
  WRONG_CEREMONY: 'هذا التوقيع ليس لتسجيل دخول',
  WRONG_CHALLENGE: 'انتهت صلاحية الطلب — حاول من جديد',
  WRONG_ORIGIN: 'التوقيع جاء من موقع آخر',
  WRONG_RP: 'التوقيع لا يخصّ هذا الموقع',
  NO_USER_PRESENT: 'لم تُلمَس البصمة على الجهاز',
  BAD_AUTH_DATA: 'بيانات المُصادِق غير صالحة',
  COUNTER_REUSED: 'عدّاد المفتاح لم يتقدّم — قد يكون منسوخاً',
  BAD_SIGNATURE: 'التوقيع غير صحيح',
  UNSUPPORTED_ALGORITHM: 'نوع المفتاح غير مدعوم',
};

export type Verdict = { ok: true; counter: number } | { ok: false; code: PasskeyRefusal };

export interface AssertionInput {
  /** base64url, as the browser sends it. */
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  /** What we stored at registration. */
  credential: { publicKey: string; algorithm: number; counter: number };
  /** What we issued, and what we are. */
  expected: { challenge: string; origin: string; rpId: string };
}

/**
 * A SIGN-IN ASSERTION, CHECKED IN FULL.
 *
 * Every refusal is its own code. «لم يعمل» on a security path is how a real
 * clone and a mistyped origin become the same support call.
 */
export function verifyAssertion(input: AssertionInput): Verdict {
  const { credential, expected } = input;

  if (!(ALLOWED_ALGORITHMS as readonly number[]).includes(credential.algorithm)) {
    return { ok: false, code: 'UNSUPPORTED_ALGORITHM' };
  }

  let client: { type?: string; challenge?: string; origin?: string };
  try {
    client = JSON.parse(b64url.decode(input.clientDataJSON).toString('utf8'));
  } catch {
    return { ok: false, code: 'BAD_CLIENT_DATA' };
  }

  // A registration signature replayed as a sign-in is the first thing to shut.
  if (client.type !== 'webauthn.get') return { ok: false, code: 'WRONG_CEREMONY' };
  if (!client.challenge || client.challenge !== expected.challenge) {
    return { ok: false, code: 'WRONG_CHALLENGE' };
  }
  // The origin is what stops a look-alike site collecting a signature.
  if (client.origin !== expected.origin) return { ok: false, code: 'WRONG_ORIGIN' };

  const authBytes = b64url.decode(input.authenticatorData);
  const auth = readAuthData(authBytes);
  if (!auth) return { ok: false, code: 'BAD_AUTH_DATA' };

  const rpHash = createHash('sha256').update(expected.rpId).digest();
  if (!auth.rpIdHash.equals(rpHash)) return { ok: false, code: 'WRONG_RP' };
  if (!auth.userPresent) return { ok: false, code: 'NO_USER_PRESENT' };

  /**
   * A counter that repeats is what a cloned key produces. An authenticator
   * that keeps no counter reports zero every time, and zero-to-zero is not
   * a clone — it is a platform key that never counts, which is most phones.
   */
  if (!(auth.counter === 0 && credential.counter === 0) && auth.counter <= credential.counter) {
    return { ok: false, code: 'COUNTER_REUSED' };
  }

  const signed = Buffer.concat([
    authBytes,
    createHash('sha256').update(b64url.decode(input.clientDataJSON)).digest(),
  ]);
  const signature = b64url.decode(input.signature);

  let key;
  try {
    key = createPublicKey({ key: Buffer.from(credential.publicKey, 'base64'), format: 'der', type: 'spki' });
  } catch {
    return { ok: false, code: 'BAD_SIGNATURE' };
  }

  try {
    const ok =
      credential.algorithm === COSE_ES256
        ? // WebAuthn signs ES256 as DER, which is what Node expects by default.
          cryptoVerify('sha256', signed, key, signature)
        : createVerify('RSA-SHA256').update(signed).verify(key, signature);
    if (!ok) return { ok: false, code: 'BAD_SIGNATURE' };
  } catch {
    return { ok: false, code: 'BAD_SIGNATURE' };
  }

  return { ok: true, counter: auth.counter };
}

/**
 * THE SAME CHECKS A REGISTRATION NEEDS, which is fewer.
 *
 * There is no signature to verify: the browser hands the public key over
 * directly, so what is left is proving the ceremony was ours.
 */
export function verifyRegistration(input: {
  clientDataJSON: string;
  expected: { challenge: string; origin: string };
  algorithm: number;
}): { ok: true } | { ok: false; code: PasskeyRefusal } {
  if (!(ALLOWED_ALGORITHMS as readonly number[]).includes(input.algorithm)) {
    return { ok: false, code: 'UNSUPPORTED_ALGORITHM' };
  }
  let client: { type?: string; challenge?: string; origin?: string };
  try {
    client = JSON.parse(b64url.decode(input.clientDataJSON).toString('utf8'));
  } catch {
    return { ok: false, code: 'BAD_CLIENT_DATA' };
  }
  if (client.type !== 'webauthn.create') return { ok: false, code: 'WRONG_CEREMONY' };
  if (!client.challenge || client.challenge !== input.expected.challenge) {
    return { ok: false, code: 'WRONG_CHALLENGE' };
  }
  if (client.origin !== input.expected.origin) return { ok: false, code: 'WRONG_ORIGIN' };
  return { ok: true };
}

/**
 * WHO WE ARE, AS THE BROWSER SEES US.
 *
 * The rpId is the registrable domain and the origin is the whole thing, and
 * getting them from the request rather than from a constant is what lets
 * this work on localhost, on a staging host and in production without three
 * builds. A signature is still only accepted for the origin it was made on.
 */
export function relyingParty(origin: string): { rpId: string; origin: string } | null {
  try {
    const u = new URL(origin);
    // WebAuthn requires a secure context; localhost is the specified exception.
    const secure = u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (!secure) return null;
    return { rpId: u.hostname, origin: u.origin };
  } catch {
    return null;
  }
}
