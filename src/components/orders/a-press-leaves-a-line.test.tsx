// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A PRESS LEAVES A LINE — AND THE LINE IS NOT AN OUTCOME.
 *
 * Four screens show a customer's number. Exactly ONE of them recorded
 * anything when somebody rang it: «طلباتي». So a call placed from the
 * orders list, from the order window, from the tracking screen or from
 * the customers screen happened and the contact log never heard of it —
 * and that log is what the next agent reads before ringing the same
 * person again.
 *
 * Worse, the one screen that did record filed a DIALLED call as
 * `ANSWERED` — the strongest outcome in the list — because it had nothing
 * weaker to say. The answer rate, the number that decides whether the
 * problem is the script or the hour of the day, counted every dial as a
 * conversation.
 *
 * So the strip records its own presses now, as `OPENED`: the dialler was
 * opened on this number, by this employee, at this moment, and nothing
 * more is claimed. Not counted toward the answer rate, not counted toward
 * the 1/2/3 no-answer close. The outcome is still recorded afterwards by
 * the person who knows it.
 *
 * These claims press the buttons and read what was sent.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a) }));

import { ContactButtons } from './ContactButtons';

const CONTEXT = { orderNumber: 'ORD-1', customerName: 'أبو محمد', amount: 25 };

/** What was POSTed to the contact log, or null. */
function logged(): { url: string; body: Record<string, unknown> } | null {
  const call = apiJson.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('/contact-attempts')
  );
  if (!call) return null;
  return { url: call[0] as string, body: JSON.parse((call[1] as { body: string }).body) };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiJson.mockResolvedValue({ templates: [] });
  // A desk browser: no touch points, so the SMS button is the disabled one.
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('pressing اتصال', () => {
  it('writes one line in this order’s contact log', async () => {
    render(<ContactButtons phone="0791234567" countryCode="962" orderId="o1" context={CONTEXT} />);

    screen.getByTitle('اتصال').click();

    await waitFor(() => expect(logged(), 'الكبسة ما سجّلت ولا سطر').not.toBeNull());
    expect(logged()!.url).toContain('/api/orders/o1/contact-attempts');
    expect(logged()!.body.contactMethod).toBe('PHONE');
  });

  it('and the line is NOT an outcome — never «answered»', async () => {
    render(<ContactButtons phone="0791234567" countryCode="962" orderId="o1" context={CONTEXT} />);

    screen.getByTitle('اتصال').click();

    await waitFor(() => expect(logged()).not.toBeNull());
    expect(logged()!.body.result, 'الكبسة انسجّلت نتيجةَ اتصال').toBe('OPENED');
    expect(logged()!.body.result).not.toBe('ANSWERED');
  });

  it('and the dialler is handed digits, not a formatted number', () => {
    render(<ContactButtons phone="+962 79 123 4567" countryCode="962" orderId="o1" context={CONTEXT} />);
    // Some phones refuse «+962 79 123 4567» as a tel: target outright.
    expect(screen.getByTitle('اتصال').getAttribute('href')).toBe('tel:+962791234567');
  });
});

describe('pressing واتساب with no order in hand', () => {
  it('opens the chat in full international form, from the country’s code', () => {
    // A local number in a `wa.me` link opens a chat with a number that does
    // not exist — which to the person pressing looks like WhatsApp being
    // broken rather than like the link being wrong.
    render(<ContactButtons phone="0791234567" countryCode="962" plain context={{}} />);

    screen.getByTitle('واتساب').click();

    expect(window.open).toHaveBeenCalledWith('https://wa.me/962791234567', '_blank', 'noopener');
  });

  it('and records nothing, because there is no order to record it against', async () => {
    render(<ContactButtons phone="0791234567" countryCode="962" plain context={{}} />);

    screen.getByTitle('واتساب').click();

    await new Promise((r) => setTimeout(r, 0));
    expect(logged(), 'انسجّل تواصل بلا طلب').toBeNull();
  });
});

describe('and the log never gets in the way of the call', () => {
  it('a refused log does not stop the dialler', async () => {
    // A role the owner has not given `orders.contact_log` still has to be
    // able to ring a customer.
    apiJson.mockRejectedValue(new Error('403'));
    render(<ContactButtons phone="0791234567" countryCode="962" orderId="o1" context={CONTEXT} />);

    const call = screen.getByTitle('اتصال');
    expect(call.getAttribute('href')).toBe('tel:0791234567');
    call.click(); // must not throw
    await new Promise((r) => setTimeout(r, 0));
  });

  it('and a number nobody has draws no buttons at all', () => {
    // Not a greyed strip: a control that cannot work is not drawn.
    const { container } = render(<ContactButtons phone={null} orderId="o1" context={CONTEXT} />);
    expect(container.textContent).toBe('');
  });
});

describe('and SMS on a desk', () => {
  it('is not a grey button — the reason stands where it would have been', () => {
    // `sms:` resolves to nothing in a desktop browser: pressed, the page
    // does not move and no error appears. A permanently disabled button
    // there reads as a broken system, which is the same fault the order
    // window's arrows had.
    render(<ContactButtons phone="0791234567" countryCode="962" orderId="o1" context={CONTEXT} />);

    expect(screen.queryByTitle('رسالة نصية'), 'زرُّ SMS مرسومٌ وهو لا يعمل').toBeNull();
    expect(screen.getByText('الرسائل النصية من الموبايل')).toBeTruthy();
  });

  it('and in a table row the strip is simply shorter', () => {
    // No room for a sentence in a row, and no room for a dead button either.
    render(
      <ContactButtons compact phone="0791234567" countryCode="962" orderId="o1" context={CONTEXT} />
    );
    expect(screen.queryByTitle('رسالة نصية')).toBeNull();
    expect(screen.queryByText('الرسائل النصية من الموبايل')).toBeNull();
    // The two that DO work are still there.
    expect(screen.getByTitle('اتصال')).toBeTruthy();
    expect(screen.getByTitle('واتساب')).toBeTruthy();
  });
});
