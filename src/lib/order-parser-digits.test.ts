import { describe, expect, it } from 'vitest';
import { parseOrderText } from './order-parser';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «ارقام الهواتف بالادخال بال ai حولها برمجيا من عربي لانجليزي» — THE OWNER, 22/10.
 *
 * A message pasted from an Arabic keypad says «الرقم: ٠٧٩١٢٣٤٥٦٧». `[0-9]` in a JavaScript regex is ASCII only, so the
 * deterministic parser did not find that phone (nor «الكمية: ٣», nor «السعر: ٢٥»), and what it did find it would have
 * handed on in whatever script it was typed. The digits are converted HERE, in code, to Latin — phone, quantity and
 * price — and nothing else in the message is touched: a street called «شارع ١٥» stays «شارع ١٥».
 * ═══════════════════════════════════════════════════════════════════════
 */

const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';
const hasNonLatinDigit = (s: string) => /[٠-٩۰-۹]/.test(s);

describe('the phone', () => {
  it('— Arabic-Indic digits after a label are read, and come out Latin', () => {
    const r = parseOrderText('الرقم: ٠٧٩١٢٣٤٥٦٧');
    expect(r.phone).toBe('0791234567');
  });

  it('and so are Persian ones — the other script an Arabic keypad types', () => {
    expect(parseOrderText('الهاتف: ۰۷۹۱۲۳۴۵۶۷').phone).toBe('0791234567');
  });

  it('and a number that mixes the scripts is read whole', () => {
    expect(parseOrderText('رقم الهاتف: ٠٧٩ 1234567').phone).toBe('079 1234567');
  });

  it('and the «+», the spaces and the brackets of a written number survive the conversion — in either script', () => {
    expect(parseOrderText('رقم الموبايل: +٩٦٢ ٧٩ ١٢٣٤٥٦٧').phone).toBe('+962 79 1234567');
    expect(parseOrderText('رقم الموبايل: +۹۶۲ ۷۹ ۱۲۳۴۵۶۷').phone).toBe('+962 79 1234567');
  });

  it('and every label the parser knows opens it', () => {
    for (const label of ['الرقم', 'رقم الهاتف', 'الهاتف', 'رقم الموبايل', 'رقم الواتس', 'واتس']) {
      expect(parseOrderText(`${label}: ٠٧٩١٢٣٤٥٦٧`).phone, label).toBe('0791234567');
    }
  });

  it('and a number with NO label is found anywhere in the text — in Latin digits — with Arabic digits as with Latin', () => {
    expect(parseOrderText('ابعتولي على ٠٧٩١٢٣٤٥٦٧ من فضلكم').phone).toBe('0791234567');
    expect(parseOrderText('ابعتولي على 0791234567 من فضلكم').phone).toBe('0791234567');
  });

  it('and nothing that comes out is left in another script — whatever went in', () => {
    for (const phone of [AR, `٠٧${AR}`, `${FA}${FA}`, '٠٧٩-١٢٣-٤٥٦٧']) {
      expect(hasNonLatinDigit(parseOrderText(`الرقم: ${phone}`).phone), phone).toBe(false);
    }
  });

  it('and a number already in Latin digits is exactly what it was — nothing about the old behaviour moved', () => {
    expect(parseOrderText('الرقم: 0936654998').phone).toBe('0936654998');
    expect(parseOrderText('الرقم: +963 936 654 998').phone).toBe('+963 936 654 998');
  });
});

describe('the quantity and the price', () => {
  it('— «الكمية: ٣» is three — not the quantity of ONE a NaN used to fall back to', () => {
    expect(parseOrderText('الكمية: ٣').quantity).toBe(3);
    expect(parseOrderText('العدد: ۱۲').quantity).toBe(12);
  });

  it('and a stated zero is still a zero, in either script', () => {
    expect(parseOrderText('الكمية: ٠').quantity).toBe(0);
    expect(parseOrderText('الكمية: 0').quantity).toBe(0);
  });

  it('and the price is read in Arabic digits, with the Arabic decimal point or the Latin ones', () => {
    expect(parseOrderText('السعر: ٢٥').price).toBe(25);
    expect(parseOrderText('السعر: ٢٥٫٥').price).toBe(25.5);
    expect(parseOrderText('السعر: ٢٥,٥').price).toBe(25.5);
    expect(parseOrderText('المبلغ: 25.5').price).toBe(25.5);
    expect(parseOrderText('الثمن: ٠').price).toBe(0);
  });
});

describe('and only what is a number', () => {
  const text = ['الاسم: سارة علي', 'الرقم: ٠٧٩١٢٣٤٥٦٧', 'العنوان: شارع ١٥، عمارة ٣', 'الملاحظات: الطابق ٢', 'الكمية: ٢', 'السعر: ٤٠'].join('\n');

  it('— the street, the building and the note keep the digits they were written in', () => {
    const r = parseOrderText(text);
    expect(r.address).toBe('شارع ١٥، عمارة ٣');
    expect(r.notes).toBe('الطابق ٢');
  });

  it('while the phone, the quantity and the price of the same message are all Latin', () => {
    const r = parseOrderText(text);
    expect([r.phone, r.quantity, r.price]).toEqual(['0791234567', 2, 40]);
  });
});
