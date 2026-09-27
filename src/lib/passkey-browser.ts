'use client';

/**
 * THE BROWSER HALF OF A PASSKEY — and it is deliberately thin.
 *
 * Everything that decides anything lives on the server. This turns the
 * server's JSON into the shapes `navigator.credentials` wants, and turns
 * what comes back into base64url. It never judges an assertion, and a
 * change here cannot make a bad signature acceptable.
 *
 * `getPublicKey()` is why there is no CBOR anywhere in this feature: the
 * browser hands the public key over already decoded as SPKI, so the server
 * stores what it is given rather than parsing an attestation object.
 */

const b64url = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Returns an ArrayBuffer rather than a view: `BufferSource` in the DOM
 * types will not take a `Uint8Array` whose buffer might be shared, and
 * widening the parameter instead of narrowing the value is how a cast
 * ends up in front of the credentials API.
 */
const fromB64url = (s: string): ArrayBuffer => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

/**
 * IS THERE A FINGERPRINT ON THIS DEVICE AT ALL?
 *
 * Asked before anything is offered: a button that opens a dialog the device
 * cannot show is worse than no button, because the person concludes the
 * feature is broken rather than absent.
 */
export async function passkeySupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface RegisterOffer {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  excludeCredentials: string[];
}

/** Runs the create ceremony and returns exactly what the server stores. */
export async function createPasskey(offer: RegisterOffer) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: fromB64url(offer.challenge),
      rp: offer.rp,
      user: {
        id: new TextEncoder().encode(offer.user.id).buffer as ArrayBuffer,
        name: offer.user.name,
        displayName: offer.user.displayName,
      },
      // ES256 first, RS256 for the security keys that do not do curves.
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      /**
       * The fingerprint or face on THIS device, and a real touch — not a
       * key the person has to carry, and not a silent assertion.
       *
       * `residentKey: 'required'` is what makes signing in POSSIBLE with
       * nothing typed: the key is stored on the device and the browser can
       * find it for this site on its own. Without it the server would have
       * to be told which account to look for first, which is the address
       * and password the fingerprint exists to replace.
       */
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
        requireResidentKey: true,
      },
      // The ones already on file, so the browser refuses to enrol the same
      // finger twice rather than making a row nobody can tell apart.
      excludeCredentials: offer.excludeCredentials.map((id) => ({
        type: 'public-key' as const,
        id: fromB64url(id),
      })),
      timeout: 60_000,
      // Nothing is attested: we do not care WHICH make of sensor it is,
      // only that the same one signs next time.
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('لم يُسجَّل أيُّ مفتاح');
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.();
  if (!publicKey) {
    // Old browsers make you parse CBOR for this. Rather than ship a parser
    // in front of authentication, they are told plainly to update.
    throw new Error('متصفّحك قديم ولا يدعم هذه الطريقة — حدّثه أو استعمل رمز التطبيق');
  }

  return {
    credentialId: b64url(credential.rawId),
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
    algorithm: response.getPublicKeyAlgorithm?.() ?? -7,
    clientDataJSON: b64url(response.clientDataJSON),
  };
}

export interface AssertOffer {
  challenge: string;
  rpId: string;
  allowCredentials: string[];
}

/** Runs the get ceremony and returns exactly what the server verifies. */
export async function signWithPasskey(offer: AssertOffer) {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: fromB64url(offer.challenge),
      rpId: offer.rpId,
      allowCredentials: offer.allowCredentials.map((id) => ({
        type: 'public-key' as const,
        id: fromB64url(id),
      })),
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('لم تُقرأ البصمة');
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    credentialId: b64url(credential.rawId),
    authenticatorData: b64url(response.authenticatorData),
    clientDataJSON: b64url(response.clientDataJSON),
    signature: b64url(response.signature),
  };
}

/**
 * SIGNING IN WITH NOTHING TYPED.
 *
 * No `allowCredentials`: the browser is not told which key to look for, so
 * it offers whichever keys for this site the device is holding and the
 * person picks. That is the whole difference between «the fingerprint
 * instead of the code» and «the fingerprint instead of logging in».
 *
 * A cancelled prompt is not a failure — the person changed their mind and
 * the password field is still there.
 */
export async function loginWithPasskey(offer: { challenge: string; rpId: string }) {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: fromB64url(offer.challenge),
      rpId: offer.rpId,
      userVerification: 'required',
      timeout: 60_000,
    },
    // Lets the browser surface keys it already knows for this site.
    mediation: 'optional',
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('لم تُقرأ البصمة');
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    credentialId: b64url(credential.rawId),
    authenticatorData: b64url(response.authenticatorData),
    clientDataJSON: b64url(response.clientDataJSON),
    signature: b64url(response.signature),
  };
}
