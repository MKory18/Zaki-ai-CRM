// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * «ترحيل طلبات قديمة» on the orders screen: pick the files (each with its day), choose the matching mechanism, see a
 * preview that wrote nothing, then move the files ONE AT A TIME — so a later file's repeat of an earlier one is
 * already «in the system» and is never written twice.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiJson: vi.fn(async () => ({ providers: [{ id: 'c-basha', name: 'الباشا' }, { id: 'c-alo', name: 'الو دليفيري' }] })),
}));

import { MigrateOrdersDialog, dateFromName } from './MigrateOrdersDialog';

const preview = {
  applied: false,
  matching: 'ref_and_phone',
  summary: { total: 5, counts: { NEW: 3, DUPLICATE_IN_FILE: 1, IN_SYSTEM: 0, REFUSED: 1 }, units: { 'ماء الكمأ': 5 }, byCourier: { الباشا: 2, 'الو دليفيري': 1 } },
  notNew: [{ file: 'a.xlsx', line: 5, verdict: 'REFUSED', reasons: ['بلا سعر'] }],
};
const ok = (body: unknown) => ({ ok: true, json: async () => body });

const sent = () =>
  apiFetch.mock.calls.map((c) => {
    const f = (c[1] as { body: FormData }).body;
    return { apply: f.get('apply'), matching: f.get('matching'), files: f.getAll('files').map((x) => (x as File).name), dates: f.getAll('dates') };
  });

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockImplementation(async (_u: string, init: { body: FormData }) =>
    init.body.get('apply') === '1' ? ok({ ...preview, applied: true, written: 1, shortages: 0, failed: [] }) : ok(preview)
  );
});
afterEach(cleanup);

const pick = () => {
  const files = [new File(['x'], 'طلبات سوريا  19-10.xlsx'), new File(['y'], 'طلبات سوريا  24-10 (1).xlsx')];
  fireEvent.change(screen.getByLabelText('ملفات الطلبات'), { target: { files } });
};

describe('the day of each file', () => {
  it('is read from its name — «19-10» is this year’s 19 October', () => {
    expect(dateFromName('طلبات سوريا  19-10.xlsx', 2026)).toBe('2026-10-19');
    expect(dateFromName('طلبات سوريا  24-10 (1).xlsx', 2026)).toBe('2026-10-24');
  });

  it('NEGATIVE: a name with no day leaves it for the person to pick', () => {
    expect(dateFromName('orders.xlsx')).toBe('');
    expect(dateFromName('99-99.xlsx')).toBe('');
  });
});

describe('the screen', () => {
  it('previews first — every file with its day and the chosen mechanism, and nothing applied', async () => {
    render(<MigrateOrdersDialog onClose={() => {}} onDone={() => {}} />);
    pick();
    fireEvent.change(screen.getByLabelText('آلية المطابقة'), { target: { value: 'ref' } });
    fireEvent.click(screen.getByRole('button', { name: /معاينة/ }));
    await screen.findByTestId('migration-preview');
    expect(sent()).toHaveLength(1);
    const y = new Date().getFullYear();
    expect(sent()[0]).toMatchObject({ apply: '0', matching: 'ref', dates: [`${y}-10-19`, `${y}-10-24`] });
    expect(screen.getByTestId('migration-preview').textContent).toContain('جديد 3');
    expect(screen.getByTestId('migration-preview').textContent).toContain('بلا سعر');
  });

  it('NEGATIVE: «ترحيل» is not offered before a preview', () => {
    render(<MigrateOrdersDialog onClose={() => {}} onDone={() => {}} />);
    pick();
    expect((screen.getByRole('button', { name: /ترحيل/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves the files one at a time, each with its own day, and says how many were written', async () => {
    const onDone = vi.fn();
    render(<MigrateOrdersDialog onClose={() => {}} onDone={onDone} />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: /معاينة/ }));
    await screen.findByTestId('migration-preview');
    fireEvent.click(screen.getByRole('button', { name: /ترحيل 3 طلب/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(2));
    const applied = sent().filter((s) => s.apply === '1');
    expect(applied.map((s) => s.files)).toEqual([['طلبات سوريا  19-10.xlsx'], ['طلبات سوريا  24-10 (1).xlsx']]);
    expect(applied.map((s) => s.dates.length)).toEqual([1, 1]);
  });

  it('NEGATIVE: changing the mechanism after a preview throws the preview away — what is moved is what was previewed', async () => {
    render(<MigrateOrdersDialog onClose={() => {}} onDone={() => {}} />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: /معاينة/ }));
    await screen.findByTestId('migration-preview');
    fireEvent.change(screen.getByLabelText('آلية المطابقة'), { target: { value: 'phone' } });
    expect(screen.queryByTestId('migration-preview')).toBeNull();
    expect((screen.getByRole('button', { name: /ترحيل/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
