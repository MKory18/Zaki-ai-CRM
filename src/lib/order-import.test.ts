import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import {
  IMPORT_COLUMNS,
  importTemplateCsv,
  isImportable,
  mapHeader,
  parseOrderSheet,
} from './order-import';

/**
 * A SHEET OF ORDERS SOMEBODY TYPED SOMEWHERE ELSE.
 *
 * There was no way in but retyping, and a hundred rows retyped is a hundred
 * chances to put the wrong digit in a phone number.
 *
 * THE RULE THIS FILE GUARDS HARDEST: the importer does not create orders.
 * `POST /api/orders` does — with its stock reservation, its cost of goods,
 * its COD arithmetic, its blacklist check, its commission and its
 * notifications — and a second creation path for imported rows would be a
 * second set of money rules that drift apart the first time either is
 * touched.
 */

const door = () => stripComments(repoFile('src/app/api/orders/import/route.ts'));
const dialog = () => stripComments(repoFile('src/components/orders/ImportOrdersDialog.tsx'));

const sheet = (rows: string[][]) => rows.map((r) => r.join(',')).join('\n');
const HEAD = ['الاسم', 'الهاتف', 'العنوان', 'المنتج', 'الكمية'];

describe('reading the file', () => {
  it('maps a header however the sheet spells it', () => {
    expect(mapHeader(['Name', 'phone', 'Address', 'product'])).toMatchObject({
      customerName: 0,
      customerPhone: 1,
      customerAddress: 2,
      productName: 3,
    });
    expect(mapHeader(['الاسم', 'الجوال', 'عنوان', 'الصنف'])).toMatchObject({
      customerName: 0,
      customerPhone: 1,
      customerAddress: 2,
      productName: 3,
    });
  });

  /** Reading the second would silently overwrite the real one. */
  it('and takes the first of a column spelled twice', () => {
    expect(mapHeader(['الهاتف', 'phone']).customerPhone).toBe(0);
  });

  it('says what is missing rather than guessing', () => {
    const out = parseOrderSheet(sheet([['الاسم', 'الهاتف'], ['أحمد', '0999']]));
    expect(out.missingRequired).toContain('العنوان');
    expect(out.missingRequired).toContain('المنتج');
    expect(out.rows).toHaveLength(0);
  });

  it('and refuses a file with no rows under the header', () => {
    expect(parseOrderSheet('a,b,c').error).toBeTruthy();
    expect(parseOrderSheet('').error).toBeTruthy();
  });
});

describe('what each row says about itself', () => {
  /**
   * NOT ONE ROW IS REFUSED OUTRIGHT. A hundred-row file with two bad phone
   * numbers is ninety-eight orders somebody wants today, and rejecting the
   * file teaches them to fix it blind in Excel and try again.
   */
  it('reports a bad row instead of throwing the file away', () => {
    const out = parseOrderSheet(
      sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', '2'], ['', 'xx', '', 'كريم', '1']])
    );
    expect(out.rows).toHaveLength(2);
    expect(isImportable(out.rows[0])).toBe(true);
    expect(isImportable(out.rows[1])).toBe(false);
    expect(out.rows[1].problems.map((p) => p.kind)).toContain('MISSING');
  });

  it('numbering rows the way the person sees them in their spreadsheet', () => {
    const out = parseOrderSheet(sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', '1']]));
    expect(out.rows[0].line, 'الترقيم لا يطابق ما يراه في إكسل').toBe(2);
  });

  it('skips a wholly blank line rather than calling it a broken row', () => {
    const out = parseOrderSheet(sheet([HEAD, ['', '', '', '', ''], ['أحمد', '0999123456', 'حمص', 'كريم', '1']]));
    expect(out.rows).toHaveLength(1);
  });

  it('defaults a missing quantity to one, and refuses a nonsense one', () => {
    const ok = parseOrderSheet(sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', '']]));
    expect(ok.rows[0].quantity).toBe(1);
    expect(ok.rows[0].problems).toHaveLength(0);

    const bad = parseOrderSheet(sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', '0']]));
    expect(bad.rows[0].problems.map((p) => p.kind)).toContain('BAD_QUANTITY');
  });

  it('and normalises the phone to the one form everything else matches on', () => {
    const out = parseOrderSheet(sheet([HEAD, ['أحمد', '+963 999 123456', 'حمص', 'كريم', '1']]));
    expect(out.rows[0].phone).toBeTruthy();
    expect(out.rows[0].phone).not.toContain(' ');
  });

  /**
   * ITS OWN ASSERTION, on a row where nothing else is wrong. A first version
   * checked the kinds on a row that was ALSO missing a name and an address,
   * so `MISSING` was there whether the phone was checked or not — and
   * deleting the phone check passed.
   */
  it('and a phone that is not a phone is said so, by name', () => {
    const out = parseOrderSheet(sheet([HEAD, ['أحمد', 'ليس رقماً', 'حمص', 'كريم', '1']]));
    const kinds = out.rows[0].problems.map((p) => p.kind);
    expect(kinds, 'الرقم غير الصالح يمرّ').toContain('BAD_PHONE');
    expect(kinds, 'اختلط بنقصٍ آخر').not.toContain('MISSING');
    expect(isImportable(out.rows[0])).toBe(false);
  });

  /**
   * A household orders twice, and a marketer's sheet legitimately carries
   * the same customer on two lines. What the person needs is to SEE it —
   * hence a line number rather than a boolean, and never a refusal.
   */
  it('points a duplicate at the line it duplicates, and lets it through', () => {
    const out = parseOrderSheet(
      sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', '1'], ['أحمد', '0999123456', 'حمص', 'كريم', '1']])
    );
    expect(out.rows[0].duplicateOfLine).toBeNull();
    expect(out.rows[1].duplicateOfLine).toBe(2);
    expect(isImportable(out.rows[1]), 'المكرَّر مرفوضٌ بدل أن يُعرض').toBe(true);
  });
});

describe('the template', () => {
  /** A hand-written template stops matching the parser the first time a column is added. */
  it('is built from the same list the parser reads', () => {
    const csv = importTemplateCsv();
    for (const c of IMPORT_COLUMNS) expect(csv, `${c.ar} ناقصة من النموذج`).toContain(c.ar);
  });

  it('marks which columns are required', () => {
    const csv = importTemplateCsv();
    for (const c of IMPORT_COLUMNS.filter((x) => x.required)) expect(csv).toContain(`${c.ar} *`);
  });

  /** Excel opens a UTF-8 CSV as mojibake without it. */
  it('and opens in Excel as Arabic, not as mojibake', () => {
    expect(importTemplateCsv().charCodeAt(0)).toBe(0xfeff);
  });

  /** The parser must accept its own template — the loop that closes the loop. */
  it('and the parser reads it back without a single complaint', () => {
    const out = parseOrderSheet(importTemplateCsv());
    expect(out.error).toBeUndefined();
    expect(out.missingRequired, 'النموذج نفسه ينقصه عمودٌ مطلوب').toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].problems, 'صفّ المثال في النموذج لا يمرّ').toEqual([]);
  });
});

describe('and the importer never creates an order itself', () => {
  it('the door writes nothing at all', () => {
    const src = door();
    for (const write of ['order.create', 'customer.create', 'orderItem.create', '$transaction']) {
      expect(src, `المستورد يكتب: ${write}`).not.toContain(write);
    }
  });

  it('the screen creates through the ordinary order door', () => {
    const src = dialog();
    expect(src).toMatch(/apiJson\('\/api\/orders', \{/);
    expect(src).toMatch(/method: 'POST'/);
  });

  /**
   * Twenty parallel creations for one new customer race each other into
   * twenty customer records, and the stock each reserves comes off the same
   * shelf.
   */
  it('one row at a time, not twenty at once', () => {
    const src = dialog();
    expect(src, 'ينشئ الصفوف على التوازي').not.toMatch(/Promise\.all\(/);
    expect(src).toMatch(/for \(const r of chosen\) \{/);
  });

  /** Row forty failing is row forty, not a rollback of thirty-nine. */
  it('and a failed row keeps its reason while the rest stand', () => {
    const src = dialog();
    expect(src).toMatch(/bad\.push\(\{ line: r\.line/);
    expect(src).toContain('أُنشئ ${made} من ${chosen.length}');
  });

  /** Pressing import twice must not create the successful ones again. */
  it('and the ones that worked leave the list', () => {
    expect(dialog()).toMatch(/p\.rows\.filter\(\(r\) => bad\.some\(\(b\) => b\.line === r\.line\)\)/);
  });

  /**
   * A name is what somebody typed and two products can be «كريم». The match
   * happens once, on the server, with the catalogue in hand — through the
   * same matcher the AI intake uses, so a hand-typed order and an imported
   * one cannot land on two different products.
   */
  it('and the product is matched on the server, not guessed by the screen', () => {
    const src = door();
    expect(src).toContain('matchProduct(');
    expect(src).toContain("from '@/lib/order-parser'");
    expect(dialog(), 'الشاشة ترسل اسم المنتج بدل معرّفه').toMatch(/productId: r\.productId/);
  });

  it('and a name with no product behind it is a problem, not a silent drop', () => {
    expect(door()).toContain('لا منتج باسم');
  });
});

describe('and it says what it found before anything is written', () => {
  it('who already has a recent order, and who is blocked', () => {
    const src = door();
    expect(src).toContain('const existingByPhone');
    expect(src).toContain('activeBlock(db, companyId, p)');
    // Cancelled and rejected ones are not a duplicate: somebody ordering
    // again after a cancellation is a sale, not a mistake.
    expect(src).toMatch(/confirmationStatus: \{ notIn: \['REJECTED', 'CANCELLED'\] \}/);
  });

  it('but blocks only what genuinely cannot become an order', () => {
    const src = door();
    expect(src).toContain('importable: problems.length === 0 && !isBlocked');
    // A duplicate stays importable — the person decides.
    expect(src, 'المكرَّر مُستبعَدٌ تلقائيّاً').not.toMatch(/importable:[^\n]*duplicateOfLine/);
  });

  /** A file big enough to hang the browser is refused with a number, not a spinner. */
  it('and refuses a file too large to work with', () => {
    const src = door();
    expect(src).toMatch(/const MAX_ROWS = \d+/);
    expect(src).toMatch(/const MAX_BYTES = /);
    // THE GUARD'S SHAPE. Declaring a limit and never comparing against it
    // leaves both the constant and the code in the file, and a first version
    // of this passed with the comparison replaced by `if (false)`.
    expect(src, 'حدّ الصفوف معلَنٌ ولا يُفحص').toMatch(/if \(parsed\.rows\.length > MAX_ROWS\) \{/);
    expect(src, 'حدّ الحجم معلَنٌ ولا يُفحص').toMatch(/if \(file\.size > MAX_BYTES\) \{/);
    expect(src).toContain('TOO_MANY_ROWS');
  });

  it('gated like creating an order, because that is what it leads to', () => {
    expect(door()).toContain("requirePermission('orders.create')");
    expect((door().match(/requirePermission\('orders\.create'\)/g) ?? []).length).toBe(2);
  });
});
