// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * «أعد توليد الملخّص» — A BUTTON FOR THE PEOPLE WHO MAY SEE WHAT IT MAKES.
 *
 * The daily summary is the company's money across every store. The server
 * now gives it only to the finance key with every country, and tells
 * everyone else why. The screen says the same: no button that fails, and
 * the server's one line in its place.
 */

const { viewer } = vi.hoisted(() => ({
  viewer: { current: { id: 'u1', role: 'CUSTOM', permissions: ['ai.use'], status: 'ACTIVE' } as Record<string, unknown> },
}));

vi.mock('@/context/AppContext', () => ({ useApp: () => ({ t: {}, locale: 'ar', currentUser: viewer.current }) }));

import { AssistantScreen } from './AssistantScreen';

const REASON = 'الملخّص التنفيذي مبني على أرقام المال للشركة كلها، ويحتاج «عرض المالية» ودخول كل المتاجر.';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ summary: null, reasonAr: REASON }) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the summary’s button', () => {
  it('is not drawn without the money key, and the reason is', async () => {
    viewer.current = { id: 'u1', role: 'CUSTOM', permissions: ['ai.use'], status: 'ACTIVE' };
    render(<AssistantScreen />);
    await waitFor(() => expect(screen.queryByText(REASON)).not.toBeNull());
    expect(screen.queryByText('أعد توليد الملخّص')).toBeNull();
  });

  it('is drawn for the money key with every country', async () => {
    viewer.current = { id: 'u1', role: 'CUSTOM', permissions: ['ai.use', 'finance.view', 'geo.manage'], status: 'ACTIVE' };
    render(<AssistantScreen />);
    expect(screen.queryByText('أعد توليد الملخّص')).not.toBeNull();
  });
});
