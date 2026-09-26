import { SignJWT, jwtVerify } from 'jose';

/**
 * THE TICKET BETWEEN THE TWO FACTORS.
 *
 * A password that is right but not yet enough has to be remembered for the
 * ninety seconds it takes to read a phone. Three ways to do that, and two
 * of them are wrong:
 *
 *   A row in a table would be state to expire, sweep and index, for
 *   something that lives a minute.
 *   A session cookie marked «half signed in» would be a session — and every
 *   guard in the product would have to learn to distrust one.
 *
 * So it is a short signed token that grants exactly two endpoints and
 * nothing else, and it is NOT a session cookie: it is returned in the body
 * and held by the page. A cookie the browser sends everywhere is a cookie
 * some other route will eventually be asked to interpret.
 *
 * It carries the purpose it was issued for. A ticket handed out to ENROL
 * cannot be spent to VERIFY — otherwise «I have not set up my authenticator
 * yet» would be a way past the authenticator.
 */

const TTL_SECONDS = 10 * 60;
const AUDIENCE = 'zaki-2fa-challenge';

function key(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // The same rule the session signer holds to: never fall back to a
    // development key on a server that is taking real logins.
    throw new Error('JWT_SECRET_MISSING');
  }
  return new TextEncoder().encode(secret);
}

export async function issueChallenge(input: {
  userId: string;
  purpose: 'enrol' | 'verify';
  remember: boolean;
}): Promise<string> {
  return new SignJWT({ sub: input.userId, purpose: input.purpose, remember: input.remember })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
}

export async function readChallenge(
  token: string | null | undefined,
  purpose: 'enrol' | 'verify'
): Promise<{ userId: string; remember: boolean } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: AUDIENCE });
    if (payload.purpose !== purpose) return null;
    if (typeof payload.sub !== 'string') return null;
    return { userId: payload.sub, remember: payload.remember === true };
  } catch {
    return null;
  }
}
