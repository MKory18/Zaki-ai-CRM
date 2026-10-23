// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openWaybills } from './openWaybills';

/**
 * `opened` SAYS WHETHER THE WAYBILLS REACHED THE SCREEN.
 *
 * The server prepares the labels either way. What a pop-up blocker decides is
 * whether anything opens: the in-click tab (before the await) and, failing
 * that, `window.open` after it — which a blocker usually refuses too, and
 * answers `null`. The Orders screen draws its «finished batch» moment only
 * when this is true, so this is the line that stops a celebration over a
 * screen that printed nothing.
 */

const REQ = { orderIds: ['o1'], width: 100, height: 150 };

function serverAnswers() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 1, refused: [], printPath: '/print/abc', pdfPath: '/pdf/abc' }),
    }))
  );
}

beforeEach(serverAnswers);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openWaybills — did the paper reach the screen', () => {
  it('the in-click tab opened: opened is true, and it was sent to the print path', async () => {
    const tab = { document: { write: vi.fn() }, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const out = await openWaybills(REQ, 'print');
    expect(out.opened).toBe(true);
    expect(tab.location.href).toBe('/print/abc');
  });

  it('the in-click tab was blocked but the fallback opens: opened is true', async () => {
    const open = vi.spyOn(window, 'open');
    open.mockReturnValueOnce(null).mockReturnValueOnce({} as Window);
    const out = await openWaybills(REQ, 'print');
    expect(out.opened).toBe(true);
    expect(open).toHaveBeenLastCalledWith('/print/abc', '_blank');
  });

  it('NEGATIVE: the blocker refuses both: opened is false, and the count is still the server’s', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const out = await openWaybills(REQ, 'print');
    expect(out.opened).toBe(false);
    expect(out.count).toBe(1);
  });

  it('a CSV is a download, not a pop-up: opened stays true without any window', async () => {
    const open = vi.spyOn(window, 'open');
    const out = await openWaybills(REQ, 'csv');
    expect(out.opened).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});
