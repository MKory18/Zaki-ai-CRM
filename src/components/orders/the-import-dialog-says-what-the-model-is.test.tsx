// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { IMPORT_COLUMNS } from '@/lib/order-import';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE IMPORT DIALOG SAYS WHAT THE MODEL FILE IS — «لما اعمل استثيراد طلبات ما في ملف مرجعي نموذج» (THE OWNER, 21/10).
 *
 * The model file lived behind a button that said only «حمّل النموذج». The line under it now says what the file holds — rows made
 * from THIS store — names the four columns that must be filled, and says the one thing that is not obvious: a price cell left
 * empty becomes a price of ZERO at the order door (the open finding in `an-import-row-reaches-the-door.test.ts`).
 *
 * The four names are not retyped from memory: they are held equal to what `IMPORT_COLUMNS` marks required, so a column added to the
 * parser cannot leave the sentence telling people to fill in fewer than the file demands.
 * ═══════════════════════════════════════════════════════════════════════
 */

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(), apiJson: vi.fn() }));

import { ImportOrdersDialog } from './ImportOrdersDialog';

let opened: Array<[string, string | undefined, string | undefined]>;

beforeEach(() => {
  opened = [];
  vi.stubGlobal('open', (...a: [string, string?, string?]) => {
    opened.push([a[0], a[1], a[2]]);
    return null;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () => render(<ImportOrdersDialog onClose={() => {}} onDone={() => {}} />);
const sentence = () => screen.getByText(/في النموذج صفوف مثال/).textContent ?? '';

describe('the line under the download button', () => {
  it('— says the model carries example rows made from THIS store: its products, its prices, a number from its country', () => {
    mount();
    const s = sentence();
    expect(s).toContain('من منتجات متجرك بأسعارها');
    expect(s).toContain('رقم هاتف من بلدك');
    expect(s).toContain('عدّلها أو امسحها');
  });

  it('and names the required columns — the same ones `IMPORT_COLUMNS` marks required, no more and no fewer', () => {
    mount();
    const s = sentence();
    const required = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.ar);
    for (const ar of required) expect(s, `«${ar}» ما انذكر`).toContain(ar);

    // And nothing else is claimed to be required: the names between «المطلوب:» and the bracket are exactly the required ones.
    const listed = /المطلوب: ([^(]+)\(/.exec(s)?.[1]?.split('،').map((x) => x.trim()).filter(Boolean) ?? [];
    expect(new Set(listed)).toEqual(new Set(required));
  });

  it('and says to write the price every time — an empty price cell is a price of zero at the order door', () => {
    mount();
    const s = sentence();
    expect(s).toContain('واكتب السعر دائماً');
    expect(s).toContain('الخانة الفارغة تُنشئ طلباً بسعر صفر');
  });

  it('and sits with the download, before the file is chosen — the place a person looks when they do not know what to write', () => {
    mount();
    const button = screen.getByText('حمّل النموذج').closest('button') as HTMLElement;
    const line = screen.getByText(/في النموذج صفوف مثال/);
    // Document order: the button, then its explanation, then the file chooser.
    expect(button.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const chooser = screen.getByText('اختر الملف');
    expect(line.compareDocumentPosition(chooser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the download itself', () => {
  it('— the button opens the template door in a new tab, without handing the new page this one', async () => {
    mount();
    await userEvent.setup().click(screen.getByText('حمّل النموذج'));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toEqual(['/api/orders/import', '_blank', 'noopener']);
  });
});
