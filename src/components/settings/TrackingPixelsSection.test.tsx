// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TrackingPixelsSection } from '@/components/settings/TrackingPixelsSection';

/**
 * Tracking settings tabs — functional tab behavior + data preservation.
 * The pixels/settings APIs are mocked at fetch level (no API changes).
 */

const pixelsFixture = [
  { id: 'p1', platform: 'META', name: 'Main', pixelId: '123456789012345', enabled: true, scope: 'GLOBAL', createdAt: '' },
  { id: 'p2', platform: 'META', name: 'Second', pixelId: '222222222222222', enabled: false, scope: 'LANDING_PAGES', createdAt: '' },
  { id: 'p3', platform: 'TIKTOK', name: 'TT', pixelId: 'TIKTOK123456', enabled: true, scope: 'GLOBAL', createdAt: '' },
  { id: 'p4', platform: 'SNAPCHAT', name: 'Snap', pixelId: '110ec58a-a0f2-4ac4-8393-c866d813b8d1', enabled: true, scope: 'GLOBAL', createdAt: '' },
];

function mockFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes('/api/settings/tracking-pixels')) {
        return { ok: true, status: 200, json: async () => ({ pixels: pixelsFixture }) };
      }
      if (url.endsWith('/api/settings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            company: {
              settings: {
                deliveryRate: 0.8,
                codConversionType: 'Purchase',
                googleTrackingIds: 'AW-12345678',
                googleAnalytics: 'G-TEST123',
                customHeadScript: '<!-- custom -->',
              },
            },
          }),
        };
      }
      if (url.includes('/api/landing-pages')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            landingPages: [
              { id: 'l1', name: 'LP One', isPublished: true, viewsCount: 100, ordersCount: 12, conversionRate: 12 },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    })
  );
}

beforeEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockFetchOk();
});

function tabBtn(key: string) {
  return screen.getByTestId(`tab-${key}`);
}

describe('Tracking settings tabs', () => {
  it('defaults to tracking-pixels content', async () => {
    render(<TrackingPixelsSection />);
    expect(tabBtn('tracking-pixels').getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByTestId('platform-META')).toBeTruthy();
    expect(screen.getAllByText(/أضف رقم التتبع/).length).toBeGreaterThan(0);
    expect(screen.getByText('Google tracking IDs')).toBeTruthy();
  });

  it('clicking analytics tab changes the panel content (live analytics)', async () => {
    render(<TrackingPixelsSection />);
    fireEvent.click(tabBtn('analytics-pixels'));
    expect(tabBtn('analytics-pixels').getAttribute('aria-selected')).toBe('true');
    expect(tabBtn('tracking-pixels').getAttribute('aria-selected')).toBe('false');
    expect(await screen.findByText('أداء صفحات الهبوط')).toBeTruthy();
    expect(await screen.findByText('LP One')).toBeTruthy();
    expect(screen.queryByText(/أضف رقم التتبع/)).toBeNull();
  });

  it('clicking custom scripts tab shows its content', async () => {
    render(<TrackingPixelsSection />);
    fireEvent.click(tabBtn('custom-scripts-pixels'));
    expect(tabBtn('custom-scripts-pixels').getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('التكاملات الخارجية الموجودة')).toBeTruthy();
    expect(await screen.findByDisplayValue('<!-- custom -->')).toBeTruthy();
  });

  it('switching back to tracking-pixels keeps data (no data loss between tabs)', async () => {
    render(<TrackingPixelsSection />);
    await screen.findByTestId('platform-META');
    fireEvent.click(tabBtn('custom-scripts-pixels'));
    await screen.findByText('التكاملات الخارجية الموجودة');
    fireEvent.click(tabBtn('analytics-pixels'));
    expect(await screen.findByText('LP One')).toBeTruthy(); // analytics data still served
    fireEvent.click(tabBtn('tracking-pixels'));
    // state preserved/reloaded: pixels + settings prefs are intact
    expect(await screen.findByText('123456789012345')).toBeTruthy();
    expect(await screen.findByText('222222222222222')).toBeTruthy();
    expect(await screen.findByText('AW-12345678')).toBeTruthy(); // google IDs list
    expect(await screen.findByDisplayValue('0.8')).toBeTruthy(); // delivery rate
    expect(screen.getByText('Google tracking IDs')).toBeTruthy();
  });

  it('multiple pixels are listed and platform switching shows only that platform', async () => {
    render(<TrackingPixelsSection />);
    await screen.findByTestId('platform-META');
    expect(await screen.findByText('123456789012345')).toBeTruthy();
    expect(await screen.findByText('222222222222222')).toBeTruthy();
    fireEvent.click(screen.getByTestId('platform-TIKTOK'));
    expect(await screen.findByText('TIKTOK123456')).toBeTruthy();
    expect(screen.queryByText('123456789012345')).toBeNull();
    fireEvent.click(screen.getByTestId('platform-SNAPCHAT'));
    expect(await screen.findByText('110ec58a-a0f2-4ac4-8393-c866d813b8d1')).toBeTruthy();
  });

  it('no blank page in any tab (aria-selected updates)', async () => {
    render(<TrackingPixelsSection />);
    for (const key of ['analytics-pixels', 'tracking-pixels', 'custom-scripts-pixels', 'tracking-pixels']) {
      fireEvent.click(tabBtn(key));
      expect(screen.getByTestId(`tab-${key}`).getAttribute('aria-selected')).toBe('true');
      expect((document.body.textContent || '').trim().length).toBeGreaterThan(0);
    }
  });

  it('tracking engine untouched — component uses the same APIs only', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/settings/TrackingPixelsSection.tsx', 'utf8');
    expect(src).not.toContain('tracking-client');
    expect(src).not.toContain('tracking-platforms');
    expect(src).not.toContain('GlobalTrackingProvider');
    expect(src).toContain('/api/settings/tracking-pixels');
  });
});