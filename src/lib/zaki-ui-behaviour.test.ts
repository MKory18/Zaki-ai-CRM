// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropdown, openModal, progress, tabs, toast, trapFocus } from '../../packages/zaki-ui/components.js';
import { probe } from '../../packages/zaki-ui/shell.js';

/**
 * WHAT CSS CANNOT DO.
 *
 * A stylesheet can paint a dialog. It cannot trap the Tab key inside it,
 * hand focus back to the button that opened it, close on Escape, or move a
 * highlight with the arrow keys — and those are the parts a person using a
 * keyboard actually depends on. So the JavaScript in this package is
 * almost entirely about focus and keys, and this is where it is proved.
 */

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  vi.useRealTimers();
});

const press = (el: Element | Document, key: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

describe('modal', () => {
  const mount = () => {
    document.body.innerHTML = `
      <button id="opener">open</button>
      <div class="zk-modal" id="m" hidden>
        <div class="zk-modal__panel">
          <button id="first">one</button>
          <input id="mid" />
          <button id="last">two</button>
        </div>
      </div>`;
    const opener = document.getElementById('opener') as HTMLButtonElement;
    opener.focus();
    return { root: document.getElementById('m') as HTMLElement, opener };
  };

  it('opens, takes focus, and announces itself as a dialog', () => {
    const { root } = mount();
    openModal(root);
    expect(root.hidden).toBe(false);
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.id).toBe('first');
  });

  /**
   * TABBING OUT OF A DIALOG LANDS ON A PAGE THE PERSON CANNOT SEE, WHOSE
   * CONTROLS STILL WORK. They fill in a form they are not looking at.
   */
  it('keeps the tab key inside it, both ways', () => {
    const { root } = mount();
    openModal(root);
    // The key event starts on the FOCUSED element and bubbles up to the
    // panel, which is where the trap listens. Dispatching on the modal
    // root instead would never reach it — events bubble up, not down.
    (document.getElementById('last') as HTMLElement).focus();
    press(document.activeElement!, 'Tab');
    expect(document.activeElement?.id).toBe('first');
    press(document.activeElement!, 'Tab', { shiftKey: true });
    expect(document.activeElement?.id).toBe('last');
  });

  it('closes on Escape and gives focus back to what opened it', () => {
    const { root } = mount();
    openModal(root);
    press(document, 'Escape');
    expect(root.hidden).toBe(true);
    expect(document.activeElement?.id, 'التركيز لم يعد إلى الزرّ').toBe('opener');
  });

  /**
   * AND THE PAGE'S SCROLL IS PUT BACK AS IT WAS FOUND, not set to a guess:
   * a drawer underneath may have locked it first.
   */
  it('restores the page scroll it found', () => {
    document.body.style.overflow = 'scroll';
    const { root } = mount();
    const close = openModal(root);
    expect(document.body.style.overflow).toBe('hidden');
    close();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('closes on a press that starts on the backdrop, and not on one that starts inside', () => {
    const { root } = mount();
    openModal(root);
    // A drag that began in the panel and ended outside is a text
    // selection, not a dismissal.
    document.getElementById('mid')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(root.hidden).toBe(false);
    root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(root.hidden).toBe(true);
  });

  it('and the trap releases, so the page is reachable again', () => {
    document.body.innerHTML = '<div id="box"><button id="a">a</button></div><button id="out">out</button>';
    const box = document.getElementById('box') as HTMLElement;
    const release = trapFocus(box);
    (document.getElementById('a') as HTMLElement).focus();
    press(document.activeElement!, 'Tab');
    expect(document.activeElement?.id).toBe('a');
    release();
    (document.getElementById('out') as HTMLElement).focus();
    expect(document.activeElement?.id).toBe('out');
  });
});

describe('toast', () => {
  it('is a live region, so a screen reader reads it at all', () => {
    toast('حُفظ', { tone: 'success' });
    const el = document.querySelector('.zk-toast') as HTMLElement;
    expect(el.getAttribute('role')).toBe('status');
    expect(document.querySelector('.zk-toasts')?.getAttribute('aria-live')).toBe('polite');
  });

  /**
   * AN ERROR DOES NOT DISMISS ITSELF.
   *
   * A success can vanish — the work is done either way. A failure the
   * person did not happen to be looking at is a failure they never learn
   * about.
   */
  it('lets a success go and keeps an error', () => {
    vi.useFakeTimers();
    toast('تمّ', { tone: 'success', timeout: 1000 });
    toast('فشل', { tone: 'error' });
    expect(document.querySelectorAll('.zk-toast')).toHaveLength(2);
    vi.advanceTimersByTime(5000);
    const left = [...document.querySelectorAll('.zk-toast')];
    expect(left).toHaveLength(1);
    expect(left[0].getAttribute('role'), 'الخطأ يُعلَن لا يُذكَر').toBe('alert');
  });
});

describe('tabs', () => {
  const mount = (dir: 'rtl' | 'ltr') => {
    document.body.innerHTML = `
      <div class="zk-tabs" id="t" role="tablist">
        <button role="tab" data-tab="a" aria-selected="true" tabindex="0">A</button>
        <button role="tab" data-tab="b" aria-selected="false" tabindex="-1">B</button>
        <button role="tab" data-tab="c" aria-selected="false" tabindex="-1">C</button>
      </div>`;
    const strip = document.getElementById('t') as HTMLElement;
    strip.style.direction = dir;
    return strip;
  };

  /**
   * «NEXT» FOLLOWS THE EYE, NOT THE DOM.
   *
   * The page is right-to-left, so the tab visually to the LEFT is the next
   * one. Following DOM order would move the highlight the opposite way
   * from the key that was pressed — worse than having no arrow keys.
   */
  it('moves with the eye in RTL', () => {
    const strip = mount('rtl');
    tabs(strip);
    press(strip, 'ArrowLeft');
    expect(strip.querySelector('[aria-selected="true"]')?.getAttribute('data-tab')).toBe('b');
  });

  it('and the other way in LTR', () => {
    const strip = mount('ltr');
    tabs(strip);
    press(strip, 'ArrowLeft');
    expect(strip.querySelector('[aria-selected="true"]')?.getAttribute('data-tab')).toBe('c');
  });

  /** One stop for the set: nine tabs must not be nine stops. */
  it('keeps one tab stop for the whole strip', () => {
    const strip = mount('rtl');
    tabs(strip);
    press(strip, 'End');
    const stops = [...strip.querySelectorAll('[role="tab"]')].filter((t) => (t as HTMLElement).tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute('data-tab')).toBe('c');
  });

  it('reports what was chosen', () => {
    const strip = mount('rtl');
    const seen: string[] = [];
    tabs(strip, { onChange: (k: string) => seen.push(k) });
    press(strip, 'Home');
    (strip.querySelector('[data-tab="c"]') as HTMLElement).click();
    expect(seen).toEqual(['a', 'c']);
  });
});

describe('dropdown', () => {
  const mount = () => {
    document.body.innerHTML = `
      <div class="zk-dropdown" id="d">
        <button aria-haspopup="menu" id="trigger">pick</button>
        <div class="zk-dropdown__menu" hidden>
          <button class="zk-dropdown__item" data-value="1" aria-selected="true">one</button>
          <button class="zk-dropdown__item" data-value="2" aria-selected="false">two</button>
        </div>
      </div>`;
    return document.getElementById('d') as HTMLElement;
  };

  it('opens with the arrow keys and chooses with Enter', () => {
    const root = mount();
    const picked: string[] = [];
    dropdown(root, { onSelect: (v: string) => picked.push(v) });
    press(root, 'ArrowDown');
    expect(root.querySelector('.zk-dropdown__menu')?.hasAttribute('hidden')).toBe(false);
    press(root, 'ArrowDown');
    press(root, 'Enter');
    expect(picked).toEqual(['2']);
  });

  it('closes on Escape and puts focus back on the trigger', () => {
    const root = mount();
    dropdown(root);
    (root.querySelector('#trigger') as HTMLElement).click();
    press(root, 'Escape');
    expect(root.querySelector('.zk-dropdown__menu')?.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement?.id).toBe('trigger');
  });

  it('and closes when the press lands elsewhere', () => {
    const root = mount();
    dropdown(root);
    (root.querySelector('#trigger') as HTMLElement).click();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(root.querySelector('.zk-dropdown__menu')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('progress', () => {
  it('says the number out loud, not only in the bar', () => {
    document.body.innerHTML = '<div class="zk-progress" id="p"><div class="zk-progress__bar"></div></div>';
    const el = document.getElementById('p') as HTMLElement;
    expect(progress(el, 3, 9)).toBeCloseTo(33.33, 1);
    expect(el.getAttribute('role')).toBe('progressbar');
    expect(el.getAttribute('aria-valuenow')).toBe('3');
    expect(el.getAttribute('aria-valuemax')).toBe('9');
  });

  it('and divides by nothing when there is nothing to divide by', () => {
    document.body.innerHTML = '<div class="zk-progress" id="p"><div class="zk-progress__bar"></div></div>';
    expect(progress(document.getElementById('p') as HTMLElement, 0, 0)).toBe(0);
  });
});

/**
 * THE APP THAT IS USUALLY OFF.
 *
 * The studio runs on the owner's own machine. An entry that looks live
 * until it is clicked teaches people the menu lies, so the switcher starts
 * from «unavailable» and only a real answer changes it.
 */
describe('probing another app', () => {
  it('says no when nothing answers', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(probe('http://localhost:8000', { fetchImpl, timeout: 10 } as never)).resolves.toBe(false);
  });

  it('says yes only when something does', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({});
    await expect(probe('http://localhost:8000', { fetchImpl, timeout: 10 } as never)).resolves.toBe(true);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'HEAD', mode: 'no-cors' });
  });
});

describe('the app shell', () => {
  beforeEach(async () => {
    await import('../../packages/zaki-ui/shell.js');
  });

  const mount = () => {
    document.body.innerHTML = `
      <zk-app-shell data-drawer="closed">
        <nav slot="sidebar">
          <div class="zk-nav-group">
            <button class="zk-nav-group__head">here</button>
            <div class="zk-nav-group__items"><a class="zk-nav-item" href="#" aria-current="page">x</a></div>
          </div>
          <div class="zk-nav-group" aria-expanded="false">
            <button class="zk-nav-group__head" id="other">other</button>
            <div class="zk-nav-group__items" hidden><a class="zk-nav-item" href="#">y</a></div>
          </div>
        </nav>
        <main slot="content"></main>
        <div class="zk-scrim" hidden></div>
      </zk-app-shell>`;
    return document.querySelector('zk-app-shell') as HTMLElement & { openDrawer(): void; closeDrawer(): void };
  };

  /**
   * COLLAPSING THE GROUP YOU ARE STANDING IN HIDES WHERE YOU ARE, and then
   * the sidebar stops answering the question it exists for.
   */
  it('opens the current group and refuses to close it', () => {
    const shell = mount();
    const [current, other] = [...shell.querySelectorAll('.zk-nav-group')] as HTMLElement[];
    expect(current.dataset.current).toBe('true');
    expect(current.getAttribute('aria-expanded')).toBe('true');
    (current.querySelector('.zk-nav-group__head') as HTMLElement).click();
    expect(current.getAttribute('aria-expanded'), 'انطوت المجموعة التي أنت فيها').toBe('true');
    // And the head says it is inert rather than merely ignoring the press.
    expect(current.querySelector('.zk-nav-group__head')?.getAttribute('aria-disabled')).toBe('true');
    expect(other.getAttribute('aria-expanded')).toBe('false');
  });

  it('but every other group still folds', () => {
    const shell = mount();
    const other = shell.querySelectorAll('.zk-nav-group')[1] as HTMLElement;
    (document.getElementById('other') as HTMLElement).click();
    expect(other.getAttribute('aria-expanded')).toBe('true');
    expect((other.querySelector('.zk-nav-group__items') as HTMLElement).hidden).toBe(false);
  });

  it('closes the drawer on Escape and when a link is followed', () => {
    const shell = mount();
    shell.openDrawer();
    expect(shell.dataset.drawer).toBe('open');
    press(document, 'Escape');
    expect(shell.dataset.drawer).toBe('closed');

    shell.openDrawer();
    // A navigation with the panel still covering the page leaves the
    // person looking at a menu, wondering whether the tap worked.
    (shell.querySelector('.zk-nav-item') as HTMLElement).click();
    expect(shell.dataset.drawer).toBe('closed');
  });
});
