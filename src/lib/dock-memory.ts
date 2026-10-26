/**
 * WHERE THE ASSISTANT'S CONVERSATION IS KEPT — AND WHEN IT IS FORGOTTEN.
 *
 * It was one key for the whole browser tab, and nothing removed it when
 * somebody left. The owner asked about net profit on the confirmation desk's
 * computer, was signed out after twenty idle minutes, and the next person to
 * sign in on that tab opened the bubble on the owner's conversation.
 *
 * So the conversation is kept under the person's own id, and every way out
 * forgets every conversation: the sign-out button, the idle sign-out, and
 * the sign-in page itself — which is where a session the server ended
 * (an expired token, a revoked one) lands, with no button pressed.
 */

const PREFIX = 'zaki_ai_dock';

/** The key one person's conversation is kept under in this tab. */
export function dockKey(userId: string): string {
  return `${PREFIX}:${userId}`;
}

/** Every conversation this tab kept, for anyone — including the old shared key. */
export function forgetDock(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k === PREFIX || k.startsWith(`${PREFIX}:`))) sessionStorage.removeItem(k);
    }
  } catch {
    // Blocked storage kept nothing to forget.
  }
}
