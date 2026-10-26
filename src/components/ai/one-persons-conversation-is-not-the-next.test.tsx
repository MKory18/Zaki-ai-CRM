// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * THE OWNER'S QUESTION ABOUT PROFIT, OPEN ON THE NEXT PERSON'S SCREEN.
 *
 * The bubble kept its conversation under one key for the whole tab, and
 * nothing removed it on the way out. The owner asked about net profit on the
 * confirmation desk's computer, was signed out after twenty idle minutes,
 * and the agent who signed in next on that tab opened the bubble on it.
 *
 * Now each person's conversation is theirs (dock-memory.ts), and every way
 * out forgets all of them.
 */

const { viewer } = vi.hoisted(() => ({ viewer: { current: { id: 'owner' } as { id: string } | null } }));

vi.mock('next/navigation', () => ({ usePathname: () => '/orders' }));
vi.mock('@/context/AppContext', () => ({
  useAppOptional: () => (viewer.current ? { currentUser: viewer.current } : null),
}));

import { AiDock } from './AiDock';
import { BulkProvider } from '@/components/shell/BulkBar';
import { dockKey, forgetDock } from '@/lib/dock-memory';
import { signOut } from '@/lib/sign-out';

const OWNERS = JSON.stringify([{ role: 'user', content: 'كم صافي الربح هالشهر؟', at: '10:00' }]);

async function openAs(id: string) {
  viewer.current = { id };
  render(
    <BulkProvider>
      <AiDock />
    </BulkProvider>,
  );
  await act(async () => {
    screen.getByRole('button', { name: 'افتح المساعد الذكي' }).click();
  });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('the conversation', () => {
  it('comes back for the person who had it', async () => {
    sessionStorage.setItem(dockKey('owner'), OWNERS);
    await openAs('owner');
    expect(screen.queryByText('كم صافي الربح هالشهر؟')).not.toBeNull();
  });

  it('is not opened for the next person on the same tab', async () => {
    sessionStorage.setItem(dockKey('owner'), OWNERS);
    await openAs('agent');
    expect(screen.queryByText('كم صافي الربح هالشهر؟')).toBeNull();
  });

  it('the one shared key from before is removed, whoever it belonged to', async () => {
    sessionStorage.setItem('zaki_ai_dock', OWNERS);
    await openAs('agent');
    expect(sessionStorage.getItem('zaki_ai_dock')).toBeNull();
    expect(screen.queryByText('كم صافي الربح هالشهر؟')).toBeNull();
  });
});

describe('every way out forgets every conversation', () => {
  it('forgetDock removes all of them, and nothing else in the tab', () => {
    sessionStorage.setItem(dockKey('owner'), OWNERS);
    sessionStorage.setItem(dockKey('agent'), '[]');
    sessionStorage.setItem('zaki_ai_dock', OWNERS);
    sessionStorage.setItem('something-else', 'keep');
    forgetDock();
    expect(sessionStorage.getItem(dockKey('owner'))).toBeNull();
    expect(sessionStorage.getItem(dockKey('agent'))).toBeNull();
    expect(sessionStorage.getItem('zaki_ai_dock')).toBeNull();
    expect(sessionStorage.getItem('something-else')).toBe('keep');
  });

  it('the sign-out — the button and the idle one alike — forgets it before leaving', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    for (const reason of ['manual', 'idle'] as const) {
      sessionStorage.setItem(dockKey('owner'), OWNERS);
      await signOut(reason);
      expect(sessionStorage.getItem(dockKey('owner')), reason).toBeNull();
    }
    vi.unstubAllGlobals();
  });
});
