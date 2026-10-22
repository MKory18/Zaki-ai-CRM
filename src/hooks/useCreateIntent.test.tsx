// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';

/**
 * «+ أنشئ» — THE SCREEN'S HALF: THE WORD IN THE ADDRESS OPENS THE FORM THE SCREEN ALREADY HAS, ONCE, AND IS TAKEN BACK OUT (22/10).
 *
 * The box goes to `/products?new=product`. What matters on arrival is not that a form opens — it is that the right form opens
 * exactly once, only for whoever the screen would have shown that button to, that a value typed by hand is not a way to call anything
 * else, and that the address is left as it was found so a refresh does not open it again.
 */

const nav: { params: URLSearchParams } = { params: new URLSearchParams() };
vi.mock('next/navigation', () => ({ useSearchParams: () => nav.params }));

import { useCreateIntent } from './useCreateIntent';
import type { CreateKey } from '@/lib/create-intent';

type Handlers = Partial<Record<CreateKey, () => void>>;

function Host({ open }: { open: Handlers }) {
  useCreateIntent(open);
  return null;
}

/** The address bar and the router's view of it agree, the way they do when Next follows `history.replaceState`. */
function visit(path: string) {
  window.history.replaceState(null, '', path);
  nav.params = new URLSearchParams(window.location.search);
}

beforeEach(() => visit('/products'));
afterEach(() => cleanup());

describe('the word opens the form', () => {
  it('— the one it names, once', () => {
    const product = vi.fn();
    const customer = vi.fn();
    visit('/products?new=product');
    render(<Host open={{ product, customer }} />);
    expect(product).toHaveBeenCalledTimes(1);
    expect(customer).not.toHaveBeenCalled();
  });

  it('— and takes the word out of the address, so a refresh or a copied link does not open it again', () => {
    visit('/products?new=product');
    render(<Host open={{ product: vi.fn() }} />);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/products');
  });

  it('— leaving every other parameter, and the hash, exactly as they were', () => {
    visit('/orders?state=POSTPONED&new=ai-order&q=%D9%85#row-4');
    render(<Host open={{ 'ai-order': vi.fn() }} />);
    expect(window.location.pathname).toBe('/orders');
    const rest = new URLSearchParams(window.location.search);
    expect([...rest.keys()].sort()).toEqual(['q', 'state']);
    expect(rest.get('state')).toBe('POSTPONED');
    expect(rest.get('q')).toBe('م');
    expect(window.location.hash).toBe('#row-4');
  });

  it('— and a word with a hyphen is a word: «ai-order» reaches its handler', () => {
    const ai = vi.fn();
    visit('/orders?new=ai-order');
    render(<Host open={{ 'ai-order': ai, 'import-orders': vi.fn() }} />);
    expect(ai).toHaveBeenCalledTimes(1);
  });
});

describe('and it is once', () => {
  it('— React running the effect twice on mount (StrictMode) still opens the form once', () => {
    const product = vi.fn();
    visit('/products?new=product');
    render(
      <React.StrictMode>
        <Host open={{ product }} />
      </React.StrictMode>
    );
    expect(product).toHaveBeenCalledTimes(1);
  });

  it('— a screen that renders again with new handler functions does not open it again', () => {
    const first = vi.fn();
    const second = vi.fn();
    visit('/products?new=product');
    const view = render(<Host open={{ product: first }} />);
    view.rerender(<Host open={{ product: second }} />);
    view.rerender(<Host open={{ product: first }} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('— the word going away and coming back is somebody choosing it again, and opens it again', () => {
    const product = vi.fn();
    visit('/products?new=product');
    const view = render(<Host open={{ product }} />);
    visit('/products');
    view.rerender(<Host open={{ product }} />);
    visit('/products?new=product');
    view.rerender(<Host open={{ product }} />);
    expect(product).toHaveBeenCalledTimes(2);
  });

  it('— a screen that is ALREADY open answers it too: the box changes the search, not the screen', () => {
    const product = vi.fn();
    visit('/products');
    const view = render(<Host open={{ product }} />);
    expect(product).not.toHaveBeenCalled();
    visit('/products?new=product');
    view.rerender(<Host open={{ product }} />);
    expect(product).toHaveBeenCalledTimes(1);
  });

  it('— calls the LATEST handler, not the one the first render captured', () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    visit('/products');
    const view = render(<Host open={{ product: stale }} />);
    visit('/products?new=product');
    view.rerender(<Host open={{ product: fresh }} />);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });
});

describe('and it opens nothing it should not', () => {
  it('— a form the screen passes no handler for is not opened (the person has no button for it), yet the word is still taken out', () => {
    // «orders.create» absent → the screen passes `undefined` for it. An address typed by hand is not a way around that.
    const customer = vi.fn();
    visit('/orders?new=order');
    render(<Host open={{ order: undefined, customer }} />);
    expect(customer).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('— a word that is not one of the seven does nothing at all, and the address is left alone', () => {
    const product = vi.fn();
    visit('/products?new=banana');
    expect(() => render(<Host open={{ product }} />)).not.toThrow();
    expect(product).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?new=banana');
  });

  it('— and a word that is a property of every object is not a call to it', () => {
    for (const word of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      const product = vi.fn();
      visit(`/products?new=${word}`);
      expect(() => render(<Host open={{ product }} />), word).not.toThrow();
      expect(product, word).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('— and a word that is also a property the handlers object happens to HAVE is still not a call to it', () => {
    // A closed set of words, not a lookup: «constructor» in the address must never reach `handlers.constructor`.
    for (const word of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      const spy = vi.fn();
      const trap = { product: vi.fn() } as Handlers;
      Object.defineProperty(trap, word, { value: spy, enumerable: true });
      visit(`/products?new=${word}`);
      render(<Host open={trap} />);
      expect(spy, word).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('— an address with no word is a screen like any other', () => {
    const product = vi.fn();
    visit('/products?q=abc');
    render(<Host open={{ product }} />);
    expect(product).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?q=abc');
  });

  it('— a screen that passes no handlers at all is fine', () => {
    visit('/products?new=product');
    expect(() => render(<Host open={{}} />)).not.toThrow();
  });
});
