'use client';

/**
 * LEAVING, IN ONE PLACE.
 *
 * Three screens had their own copy of "post to logout, then go to /login".
 * Three copies is three chances for one of them to skip the post and clear
 * only the cookie — which leaves the session token valid on the server,
 * still accepted by anybody who kept a copy of it. The server-side bump of
 * tokenVersion is what actually ends a session; the redirect is only what
 * the person sees.
 *
 * The reason travels with it so the audit trail can tell a person leaving
 * from a phone left on a counter. They are the same action and a very
 * different fact.
 */

export type SignOutReason = 'manual' | 'idle';

export async function signOut(reason: SignOutReason = 'manual'): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  } catch {
    // The network is gone. The cookie still has to go, and the page still
    // has to leave — an unreachable server is not a reason to stay signed
    // in on a device somebody is walking away from.
  }
  window.location.href = reason === 'idle' ? '/login?idle=1' : '/login';
}
