// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «الصلاحيات» SAYS WHAT A COMBINATION WILL DO, BESIDE THE TICKS.
 *
 * C1's rule: a confirmation agent cannot confirm, postpone or cancel an
 * order until she has tried to reach the customer. Recording that attempt
 * is now `orders.contact_log`.
 *
 * So a role with `confirmation.work` and without it is handed a queue it
 * can open and can never dispose of: every button locked, with a line
 * underneath telling her to call first and no way to say that she did.
 *
 * Nothing refuses that combination — the owner may want it for a
 * read-only supervisor — so the screen says it, in the one place where it
 * is being caused, rather than in a support message three days later.
 * ═══════════════════════════════════════════════════════════════════════
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/permissions', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ failed: vi.fn(), done: vi.fn() }) }));
vi.mock('@/components/ui/Confirm', () => ({ useConfirm: () => vi.fn(async () => true), useTell: () => vi.fn() }));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    locale: 'ar',
    t: {},
    currentUser: { id: 'u0', role: 'SUPER_ADMIN', permissions: [], status: 'ACTIVE' },
  }),
}));

import { PermissionsScreen } from './PermissionsScreen';

const WARNING = 'ما بيقدر يأكّد ولا يأجّل';
const FIX = 'تسجيل نتيجة الاتصال';
const ROLE_NAME = 'موظّف تأكيد';

/** The roles list, as `/api/roles` answers it, holding exactly these keys. */
function roleHolding(...keys: string[]) {
  const role = {
    id: 'r1',
    name: ROLE_NAME,
    usersCount: 2,
    isSystem: false,
    permissions: keys.map((permission) => ({ permission, scope: 'ALL_COMPANY', scopeIds: [] })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('/default') ? { available: false } : { roles: [role] }),
    }))
  );
}

/** Open the role's editor — the warning lives beside its ticks. */
async function openTheRole() {
  const user = userEvent.setup();
  await waitFor(() => expect(screen.queryByText(ROLE_NAME)).not.toBeNull());
  await user.click(await screen.findByText('تعديل'));
  // The editor is open once a module heading is on screen.
  await waitFor(() => expect(screen.queryByText('الطلبات')).not.toBeNull());
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a role that works the queue', () => {
  it('is warned when it cannot record a call, and told what to tick', async () => {
    roleHolding('confirmation.work', 'orders.view', 'orders.confirm');
    render(<PermissionsScreen />);
    await openTheRole();

    expect(screen.queryByText(new RegExp(WARNING)), 'ما حذّر').not.toBeNull();
    expect(screen.queryByText(new RegExp(FIX)), 'قال المشكلة وما قال الحلّ').not.toBeNull();
  });

  it('and is not warned once it can', async () => {
    roleHolding('confirmation.work', 'orders.view', 'orders.confirm', 'orders.contact_log');
    render(<PermissionsScreen />);
    await openTheRole();

    expect(screen.queryByText(new RegExp(WARNING)), 'حذّر رغم إنّ الدور بيقدر يسجّل').toBeNull();
  });

  it('and a role that never works the queue is not warned either', async () => {
    // An accountant holds neither; the combination is not about her.
    roleHolding('orders.view', 'reports.export');
    render(<PermissionsScreen />);
    await openTheRole();

    expect(screen.queryByText(new RegExp(WARNING))).toBeNull();
  });
});
