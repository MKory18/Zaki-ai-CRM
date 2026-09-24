// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CurrencyPicker, currencyChoiceReady, type CurrencyChoice } from './CurrencyPicker';

/**
 * ONE CURRENCY CONTROL FOR EVERY COUNTRY FORM.
 *
 * A listed currency brings its official decimals; any other is typed as an
 * ISO code and asks for its decimals — never a silent 2. A country created
 * on an unlisted currency opens on it, so it can still be corrected.
 */

let last: CurrencyChoice = { code: '', minorUnit: null };

function Harness({ initial }: { initial: CurrencyChoice }) {
  const [value, setValue] = useState(initial);
  last = value;
  return <CurrencyPicker value={value} onChange={setValue} />;
}

afterEach(cleanup);

const currencySelect = () => screen.getAllByRole('combobox')[0] as HTMLSelectElement;
const decimalsSelect = () => screen.getAllByRole('combobox')[1] as HTMLSelectElement;

describe('picking a listed currency', () => {
  it('fills in its official decimals', () => {
    render(<Harness initial={{ code: '', minorUnit: null }} />);
    fireEvent.change(currencySelect(), { target: { value: 'JOD' } });
    expect(last).toEqual({ code: 'JOD', minorUnit: 3 });
    expect(currencyChoiceReady(last)).toBe(true);
  });

  it('says so when the decimals differ from the official ones', () => {
    render(<Harness initial={{ code: 'KWD', minorUnit: 3 }} />);
    expect(screen.queryByText(/الرسمي لـ KWD/)).toBeNull();
    fireEvent.change(decimalsSelect(), { target: { value: '2' } });
    expect(screen.getByText(/الرسمي لـ KWD هو 3/)).toBeTruthy();
  });
});

describe('another currency', () => {
  it('is typed as an ISO code and is not ready until its decimals are chosen', () => {
    render(<Harness initial={{ code: '', minorUnit: null }} />);
    fireEvent.change(currencySelect(), { target: { value: '__other' } });
    fireEvent.change(screen.getByLabelText('رمز العملة (ISO)'), { target: { value: 'gbp' } });
    expect(last).toEqual({ code: 'GBP', minorUnit: null });
    expect(currencyChoiceReady(last)).toBe(false);
    fireEvent.change(decimalsSelect(), { target: { value: '2' } });
    expect(currencyChoiceReady(last)).toBe(true);
  });

  it('a country already on one opens on it, editable', () => {
    render(<Harness initial={{ code: 'GBP', minorUnit: 2 }} />);
    expect(currencySelect().value).toBe('__other');
    expect((screen.getByLabelText('رمز العملة (ISO)') as HTMLInputElement).value).toBe('GBP');
  });
});

describe('what is never ready', () => {
  it('refuses a code that is not three letters, and missing decimals', () => {
    expect(currencyChoiceReady({ code: 'GB', minorUnit: 2 })).toBe(false);
    expect(currencyChoiceReady({ code: 'GB1', minorUnit: 2 })).toBe(false);
    expect(currencyChoiceReady({ code: 'GBP', minorUnit: null })).toBe(false);
  });
});
