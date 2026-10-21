'use client';

import { useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import { canAccessRoute, findRoute, type RouteDef } from '@/lib/route-registry';

/**
 * «MAY THIS PERSON OPEN THAT SCREEN?» — ASKED ONCE, FOR EVERY LINK THAT IS OFFERED.
 *
 * `notification.ts` already says it: a link is a promise that clicking it
 * leads somewhere, and it drops one the recipient's own guard would refuse.
 * The dashboard learned the same lesson when a moderator was offered
 * «طابور التأكيد» and every card ended in «لا تملك صلاحية لهذه الشاشة».
 *
 * Each place that offered a link wrote its own copy of the check. Now that
 * a toast can carry a link too, there would have been a third, so it is here
 * — and it is NOT a second rule. It is `canAccessRoute`, the function the
 * sidebar and the guard both use, handed the client's `userCan` as the
 * permission check (that is what the parameter is for).
 *
 * It decides whether to OFFER. The door behind the screen decides whether
 * to OPEN: a person who is offered a link they should not have been, and
 * follows it, is refused there exactly as they would have been before.
 *
 * Takes a registry path (`'/orders'`, with or without a query) or a route
 * already in hand. A path the registry does not name is `false`, never
 * `true`: «I cannot tell» is not permission to link.
 */
export function useMayOpen(): (target: string | RouteDef) => boolean {
  const { currentUser } = useApp();
  return useCallback(
    (target) => {
      if (!currentUser) return false;
      const route = typeof target === 'string' ? findRoute(target.split('?')[0]) : target;
      return !!route && canAccessRoute(currentUser, route, userCan);
    },
    [currentUser]
  );
}
