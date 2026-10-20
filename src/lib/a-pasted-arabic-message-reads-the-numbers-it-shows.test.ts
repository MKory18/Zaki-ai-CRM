import { describe, expect, it } from 'vitest';
import { parseOrderText } from './order-parser';

/**
 * A MESSAGE PASTED INTO THE AI INTAKE READS THE NUMBERS IT SHOWS.
 *
 * The intake door exists for a seller pasting a WhatsApp message and
 * letting the machine read it — and a WhatsApp message typed on an Arabic
 * keypad shows «١٥» where the field captures of order-parser matched
 * `[0-9]` only. Every other reader in the system (the phone rules, the
 * numeric readers, the page-number readers) had already learned the one
 * named conversion — toLatinDigits — while this parser kept refusing a
 * real order written in the script the storefront is written for.
 *
 * Measured before the fix:
 *
 *     parseOrderText('الكمية: ٣\nالسعر: ١٥').quantity   →  1
 *     parseOrderText('الكمية: ٣\nالسعر: ١٥').price      →  null
 *
 * A quantity the seller wrote as three arrived as one, and the review
 * screen showed a number nobody wrote.
 */

describe('a pasted order typed with Arabic-keypad digits', () => {
  it('reads the quantity and the price the message actually shows', () => {
    const parsed = parseOrderText('الاسم: أحمد\nالرقم: ٠٩٣٣١٢٣٤٥٦\nالمنتج: كريم الوجه\nالكمية: ٣\nالسعر: ١٥');
    expect(parsed.quantity).toBe(3);
    expect(parsed.price).toBe(15);
  });

  it('reads the phone in the full-message form too', () => {
    // Field-labelled and bare-number fallback both.
    expect(parseOrderText('الرقم: ٠٩٦٦٧٩٣٩١٨').phone).toBe('0966793918');
    expect(parseOrderText('طبيعة بسيطة ٠٩٦٦٧٩٣٩١٨ ادفعو عند الاستلام').phone).toBe('0966793918');
  });

  it('and written with Persian digits is the same message', () => {
    const parsed = parseOrderText('الكمية: ۲\nالسعر: ۱۲');
    expect(parsed.quantity).toBe(2);
    expect(parsed.price).toBe(12);
  });

  it('and a Latin-typed message still reads as before', () => {
    // The conversion maps digits to digits and touches nothing else.
    const latin = parseOrderText('الاسم: أحمد\nالرقم: 0933123456\nالمنتج: كريم الوجه\nالكمية: 3\nالسعر: 15');
    expect(latin.quantity).toBe(3);
    expect(latin.price).toBe(15);
    expect(latin.phone).toBe('0933123456');
  });

  it('and the product name keeps every digit it had', () => {
    // «صوبة القدس 4 شعلات» must not drift when the message is Arabic-typed…
    expect(parseOrderText('المنتج: صوبة القدس ٤ شعلات').productQuery).toBe('صوبة القدس 4 شعلات');
  });
});
