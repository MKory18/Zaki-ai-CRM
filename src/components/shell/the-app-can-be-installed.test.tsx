// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * «زر تثبيت تطبيق باللاب و التلفون ضروري».
 *
 * The app could be installed all along and no screen said so. These pin
 * the three ways a browser installs, and the two times nothing may be
 * drawn: the app is already installed, or this browser cannot install.
 *
 * The offer is caught when the module loads, so every test loads a fresh
 * copy — an offer used in one test must not be lying around in the next.
 */

type Mod = typeof import('./InstallApp');
async function fresh(): Promise<Mod> {
  vi.resetModules();
  return import('./InstallApp');
}

/** What Chrome fires when it is ready to install, with its dialog stubbed. */
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => {
    window.dispatchEvent(e);
  });
  return { e, prompt };
}

function pretend(ua: string, touch = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true });
}

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAC_SAFARI = IPAD;
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

const BUTTON = 'ثبّت التطبيق';

beforeEach(() => {
  pretend(CHROME_WIN);
  localStorage.clear();
  window.matchMedia = undefined as never;
});
afterEach(() => {
  cleanup();
  delete (navigator as unknown as Record<string, unknown>).userAgent;
  delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
  delete (navigator as unknown as Record<string, unknown>).standalone;
});

describe('Chrome, Edge and Android: the browser offers, the button opens its dialog', () => {
  it('appears when the browser offers, and one click opens the browser’s own dialog', async () => {
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();

    const { e, prompt } = offer('accepted');
    // Chrome's own bar is suppressed: ours takes its place.
    expect(e.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: BUTTON }));
    expect(prompt).toHaveBeenCalledTimes(1);
    // Installed: the button has nothing left to do.
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('a refused dialog drops the spent offer, and a new offer brings the button back', async () => {
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    offer('dismissed');
    await userEvent.click(screen.getByRole('button', { name: BUTTON }));
    // The event is single-use: a second prompt() on it would throw.
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();

    const again = offer('accepted');
    await userEvent.click(screen.getByRole('button', { name: BUTTON }));
    expect(again.prompt).toHaveBeenCalledTimes(1);
  });

  it('an offer made BEFORE the header mounted is not missed', async () => {
    const { InstallAppButton } = await fresh();
    offer();
    render(<InstallAppButton />);
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
  });

  it('goes the moment the browser says the app was installed another way', async () => {
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    offer();
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });
});

describe('iPhone, iPad and Safari on a Mac: no dialog exists, so the button opens the steps', () => {
  it('iPhone: the button is there with no offer, and opens «إضافة إلى الشاشة الرئيسية»', async () => {
    pretend(IPHONE, 5);
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    await userEvent.click(screen.getByRole('button', { name: BUTTON }));
    expect(screen.getByRole('dialog').textContent).toContain('إضافة إلى الشاشة الرئيسية');
  });

  it('an iPad that calls itself a Mac is still an iPad — its touch screen gives it away', async () => {
    pretend(IPAD, 5);
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    await userEvent.click(screen.getByRole('button', { name: BUTTON }));
    expect(screen.getByRole('dialog').textContent).toContain('زر المشاركة');
  });

  it('Safari on a Mac: the steps go through the File menu', async () => {
    pretend(MAC_SAFARI, 0);
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    await userEvent.click(screen.getByRole('button', { name: BUTTON }));
    const steps = screen.getByRole('dialog').textContent!;
    expect(steps).toContain('«ملف»');
    expect(steps).not.toContain('الشاشة الرئيسية');
  });
});

describe('nothing is drawn where nothing can be done', () => {
  it('Firefox, and a Chrome that has not offered: no button that does nothing', async () => {
    for (const ua of [FIREFOX, CHROME_WIN, MAC_CHROME]) {
      pretend(ua, 0);
      const { InstallAppButton, InstallAppStrip } = await fresh();
      render(
        <>
          <InstallAppButton />
          <InstallAppStrip />
        </>,
      );
      expect(screen.queryByRole('button', { name: BUTTON }), ua).toBeNull();
      expect(screen.queryByRole('region', { name: 'تثبيت التطبيق' }), ua).toBeNull();
      cleanup();
    }
  });

  it('opened from its icon, the app offers nothing — even if the browser still does', async () => {
    window.matchMedia = ((q: string) => ({ matches: q === '(display-mode: standalone)' })) as never;
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    offer();
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('an iPhone opened from the home screen offers nothing either', async () => {
    pretend(IPHONE, 5);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const { InstallAppButton } = await fresh();
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });
});

describe('the phone: a strip seen without opening anything, and a line in «المزيد» that stays', () => {
  it('the strip installs, and «ليس الآن» rests it for two weeks on this phone', async () => {
    const { InstallAppStrip } = await fresh();
    const { unmount } = render(<InstallAppStrip />);
    const { prompt } = offer('dismissed');
    const strip = screen.getByRole('region', { name: 'تثبيت التطبيق' });
    expect(strip.textContent).toContain('ثبّت النظام على هاتفك');

    await userEvent.click(screen.getByRole('button', { name: 'ليس الآن' }));
    expect(screen.queryByRole('region', { name: 'تثبيت التطبيق' })).toBeNull();
    expect(prompt).not.toHaveBeenCalled();

    // Still resting on the next visit…
    unmount();
    render(<InstallAppStrip />);
    offer();
    expect(screen.queryByRole('region', { name: 'تثبيت التطبيق' })).toBeNull();

    // …and back after the two weeks.
    cleanup();
    localStorage.setItem('zaki.install.later', String(Date.now() - 15 * 24 * 60 * 60 * 1000));
    render(<InstallAppStrip />);
    await userEvent.click(screen.getByRole('button', { name: 'ثبّت' }));
    expect(screen.queryByRole('region', { name: 'تثبيت التطبيق' })).toBeNull();
  });

  it('the line in «المزيد» is there while installing is possible, and not otherwise', async () => {
    const { InstallAppLine } = await fresh();
    render(<InstallAppLine className="" />);
    expect(screen.queryByRole('button', { name: 'ثبّت التطبيق على هاتفك' })).toBeNull();
    const { prompt } = offer();
    await userEvent.click(screen.getByRole('button', { name: 'ثبّت التطبيق على هاتفك' }));
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
