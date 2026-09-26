import { describe, expect, it, beforeAll } from 'vitest';
import { issueChallenge, readChallenge } from './two-factor-challenge';

/**
 * THE TICKET BETWEEN THE TWO FACTORS.
 *
 * It says «this password was right», and nothing else. The rules that matter
 * are what it CANNOT do: it is not a session, it cannot be spent for a
 * purpose it was not issued for, and it does not outlive the minute it takes
 * to read a phone.
 */

beforeAll(() => {
  process.env.JWT_SECRET = 'a'.repeat(48);
});

describe('a challenge', () => {
  it('carries the user and whether they asked to be remembered', async () => {
    const t = await issueChallenge({ userId: 'u1', purpose: 'verify', remember: true });
    expect(await readChallenge(t, 'verify')).toEqual({ userId: 'u1', remember: true });
  });

  /**
   * AN ENROL TICKET IS NOT A VERIFY TICKET.
   *
   * Without this, «I have not set up my authenticator yet» is a way past the
   * authenticator: the login hands an unenrolled owner an enrol ticket, and
   * if that same ticket opened `/verify` it would be a password-only session
   * for exactly the roles the second factor exists to protect.
   */
  it('cannot be spent for a purpose it was not issued for', async () => {
    const enrol = await issueChallenge({ userId: 'u1', purpose: 'enrol', remember: false });
    expect(await readChallenge(enrol, 'verify'), 'تذكرةُ تفعيلٍ فتحت بابَ التحقّق').toBeNull();

    const verify = await issueChallenge({ userId: 'u1', purpose: 'verify', remember: false });
    expect(await readChallenge(verify, 'enrol')).toBeNull();
  });

  it('refuses a forgery, a blank and a token signed with another key', async () => {
    expect(await readChallenge(null, 'verify')).toBeNull();
    expect(await readChallenge('', 'verify')).toBeNull();
    expect(await readChallenge('not.a.token', 'verify')).toBeNull();

    const real = await issueChallenge({ userId: 'u1', purpose: 'verify', remember: false });
    process.env.JWT_SECRET = 'b'.repeat(48);
    expect(await readChallenge(real, 'verify'), 'قُبل توقيعُ مفتاحٍ آخر').toBeNull();
    process.env.JWT_SECRET = 'a'.repeat(48);
  });

  /** A tampered payload changes the signature; one flipped character is enough. */
  it('refuses a tampered payload', async () => {
    const t = await issueChallenge({ userId: 'u1', purpose: 'verify', remember: false });
    const [h, p, s] = t.split('.');
    const body = JSON.parse(Buffer.from(p, 'base64url').toString());
    body.sub = 'someone-else';
    const forged = `${h}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${s}`;
    expect(await readChallenge(forged, 'verify')).toBeNull();
  });

  /**
   * AND IT IS NOT SIGNED WITH A DEVELOPMENT KEY.
   *
   * The session signer refuses to start without a real `JWT_SECRET`, and a
   * ticket that let itself be signed with a weak one would be the cheaper
   * door into exactly the same account.
   */
  it('refuses to be issued without a real signing key', async () => {
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'short';
    await expect(issueChallenge({ userId: 'u1', purpose: 'verify', remember: false })).rejects.toThrow(
      'JWT_SECRET_MISSING'
    );
    delete process.env.JWT_SECRET;
    await expect(issueChallenge({ userId: 'u1', purpose: 'verify', remember: false })).rejects.toThrow(
      'JWT_SECRET_MISSING'
    );
    process.env.JWT_SECRET = saved;
  });
});
