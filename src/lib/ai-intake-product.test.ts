import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * THE PRODUCT BOX ON THE AI INTAKE.
 *
 * Two faults in one control, on the door that exists for pasting a whole
 * WhatsApp message and having the machine read it:
 *
 *   1. A native `<select>` over the entire catalogue — measured at 114
 *      products — with no search. The same fault was already fixed on the
 *      new-order form and the return, and both of those go through
 *      `ProductPicker`. This one was missed.
 *
 *   2. NO EMPTY ROW. When the parser matched nothing, `productId` stayed
 *      `''` and the browser drew the FIRST product in the list as though it
 *      were the chosen one. Accepting what the screen showed sent an empty
 *      productId, which `/api/orders/ai-intake` refuses
 *      (`productId: z.string().min(10)`) — a 400 about a box that looked
 *      filled in. A control that displays a value it does not hold is worse
 *      than one that is empty.
 *
 * And the price was labelled «السعر ($)» on every store in the world.
 */

const src = () => repoFile('src/components/orders/AiOrderModal.tsx');

describe('the AI intake’s product box', () => {
  it('is the shared searchable picker, not a native dropdown over the catalogue', () => {
    const body = stripComments(src());
    expect(body).toContain("import { ProductPicker } from '@/components/ui/ProductPicker'");
    expect(body).toMatch(/<ProductPicker[\s\S]{0,400}?value=\{productId\}/);
  });

  /** The escape: a `<select>` whose options are the catalogue. */
  it('never draws the catalogue as <option> rows', () => {
    const body = stripComments(src());
    expect(body).not.toMatch(/products\.map\(\s*\(?\s*prod\s*\)?\s*=>\s*\(?\s*<option/);
    expect(body).not.toMatch(/<option[^>]*>\s*\{prod\.name\}/);
  });

  it('offers the row that means «nothing chosen», so an unmatched parse looks unmatched', () => {
    expect(stripComments(src())).toMatch(/anyOption=\{\{\s*value:\s*''\s*,\s*label:\s*'— اختر منتجًا —'\s*\}\}/);
  });

  it('refuses to submit without a product, in a sentence rather than a schema error', () => {
    const body = stripComments(src());
    expect(body).toMatch(/if \(!productId\) \{[\s\S]{0,200}?toast\.failed\(/);
  });

  it('labels the price in the store’s own currency, never a hard-coded dollar', () => {
    const body = stripComments(src());
    expect(body).toContain('label={`السعر${currency?.code ? ` (${currency.code})` : \'\'}`}');
    expect(body, 'دولارٌ مكتوبٌ بيده').not.toContain('السعر ($)');
  });

  it('is a whole dialog, not a stub that happens to contain the words', () => {
    expect(src().length).toBeGreaterThan(2000);
    expect(src()).toContain('handleConfirm');
  });
});
