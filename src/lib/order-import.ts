import { looksLikeXlsx, readXlsxRows } from './xlsx-reader';
import { splitCsvLine } from './settlement';
import { normalizePhoneNumber } from './phone';
import { readTypedFigure } from './numeric-input';
import { roundMinor } from './money';

/**
 * A SHEET OF ORDERS SOMEBODY TYPED SOMEWHERE ELSE.
 *
 * Orders arrive in a spreadsheet — from a marketer's own sheet, from an ad
 * platform's export, from a supplier who takes the calls. Until now the only
 * way in was to retype them one at a time, and a hundred rows retyped is a
 * hundred chances to put the wrong digit in a phone number.
 *
 * WHAT THIS FILE DOES NOT DO: create an order. Not one line of it writes
 * anything. Order creation is `POST /api/orders` — with its stock
 * reservation, its cost of goods, its COD arithmetic, its blacklist check,
 * its commission and its notifications — and a second implementation of that
 * for imported rows would be a second set of money rules, drifting from the
 * first the day either changes. This reads a file, says what it found, and
 * hands back rows for that door to take one at a time.
 *
 * READ, THEN DECIDE, THEN IMPORT. A file is not a promise: a duplicate in it
 * is the commonest thing in the world, and so is a row with a phone number
 * three digits short. Every row comes back with a verdict and the person
 * drops the ones they do not want before anything is written.
 */

/** A column we understand, and every spelling a real sheet has used for it. */
export interface ImportColumn {
  key: string;
  ar: string;
  required: boolean;
  /** Lower-cased, space-stripped aliases — Arabic and English. */
  aliases: readonly string[];
}

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: 'customerName', ar: 'اسم العميل', required: true, aliases: ['الاسم', 'اسمالعميل', 'العميل', 'name', 'customer', 'customername', 'fullname'] },
  { key: 'customerPhone', ar: 'الهاتف', required: true, aliases: ['الهاتف', 'الجوال', 'الموبايل', 'رقمالهاتف', 'phone', 'mobile', 'customerphone'] },
  { key: 'customerAltPhone', ar: 'هاتف بديل', required: false, aliases: ['هاتفبديل', 'الهاتفالبديل', 'رقمثاني', 'altphone', 'phone2'] },
  { key: 'customerAddress', ar: 'العنوان', required: true, aliases: ['العنوان', 'عنوان', 'address'] },
  { key: 'customerCity', ar: 'المدينة/المحافظة', required: false, aliases: ['المدينة', 'المحافظة', 'city', 'region', 'governorate'] },
  { key: 'productName', ar: 'المنتج', required: true, aliases: ['المنتج', 'اسمالمنتج', 'الصنف', 'product', 'productname', 'sku', 'item'] },
  { key: 'quantity', ar: 'الكمية', required: false, aliases: ['الكمية', 'العدد', 'quantity', 'qty'] },
  { key: 'sellingPrice', ar: 'السعر', required: true, aliases: ['السعر', 'سعرالبيع', 'المبلغ', 'price', 'amount', 'total'] },
  { key: 'notes', ar: 'ملاحظات', required: false, aliases: ['ملاحظات', 'ملاحظة', 'notes', 'note', 'comment'] },
];

/**
 * A header cell reduced to what it means.
 *
 * The trailing `*` matters: the template marks required columns with one,
 * and without stripping it the parser could not read its own template —
 * «الهاتف *» matched nothing and the file came back «ينقصه الهاتف». The
 * test that closes that loop is the one that found it.
 */
const norm = (s: string) =>
  s
    .trim()
    .replace(/[*\u200f\u200e]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]/g, '');

/** The header row mapped onto our columns; unknown columns are ignored. */
export function mapHeader(header: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    const col = IMPORT_COLUMNS.find((c) => c.aliases.includes(n) || norm(c.ar) === n || norm(c.key) === n);
    // First match wins: a sheet with «الهاتف» twice means the second is a
    // stray copy, and reading it would silently overwrite the real one.
    if (col && out[col.key] === undefined) out[col.key] = i;
  });
  return out;
}

export type RowProblem = 'MISSING' | 'BAD_PHONE' | 'BAD_QUANTITY' | 'BAD_PRICE';

export interface ParsedRow {
  /** 1-based, counting the header — what the person sees in their spreadsheet. */
  line: number;
  values: Record<string, string>;
  /** The phone in the one form everything else matches on. */
  phone: string | null;
  /**
   * How many units — `null` when the cell held something unreadable.
   *
   * It used to be `number`, with 1 written in whenever the cell could not
   * be read. But 1 is also what an EMPTY cell means, so the screen printed
   * «× 1» over a cell that said «0x10» and the two were indistinguishable
   * at a glance. An unreadable cell is `null` AND carries a `BAD_QUANTITY`
   * problem; an empty one is 1 and carries nothing.
   */
  quantity: number | null;
  /**
   * The price in the sheet — for the WHOLE line, as the «السعر» column means — or `null`, and `null` always carries a problem:
   * `MISSING` when the cell was empty, `BAD_PRICE` when it held something this parser refused to guess at. Either way the row
   * cannot be imported.
   *
   * 22/10, the owner's ruling («ارفض الصف»): an EMPTY price cell used to pass, with `null` and no problem, on the assumption that
   * it meant «charge the product's own price». It never did: `POST /api/orders` builds its line as `unitPrice: sellingPrice ?? 0`
   * and reads `basePrice` nowhere, so a blank cell stored an order at ZERO. The price column is required now, and a row without
   * a price is refused by name — which is the one change that needs no change to how an order is created.
   */
  sellingPrice: number | null;
  problems: { field: string; kind: RowProblem; ar: string }[];
  /** Another row in THIS file has the same phone. Never a refusal. */
  duplicateOfLine: number | null;
}

export interface ParsedImport {
  columns: Record<string, number>;
  missingRequired: string[];
  rows: ParsedRow[];
  error?: string;
}

/**
 * THE WHOLE FILE, ROW BY ROW — and nothing is refused outright.
 *
 * A problem is reported against the row, not thrown: a hundred-row file with
 * two bad phone numbers is ninety-eight orders somebody wants today, and
 * rejecting the file teaches them to fix it blind in Excel and try again.
 */
export function parseOrderSheet(content: string | Buffer | Uint8Array, countryCode?: string | null): ParsedImport {
  let sheet: string[][];

  if (typeof content !== 'string' && looksLikeXlsx(content)) {
    try {
      sheet = readXlsxRows(content);
    } catch (e) {
      return { columns: {}, missingRequired: [], rows: [], error: e instanceof Error ? e.message : 'تعذّر قراءة ملف الإكسل' };
    }
  } else {
    const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    sheet = lines.map(splitCsvLine);
  }

  if (sheet.length < 2) {
    return { columns: {}, missingRequired: [], rows: [], error: 'الملف فارغ أو لا يحتوي صفوفاً تحت العناوين' };
  }

  const columns = mapHeader(sheet[0]);
  const missingRequired = IMPORT_COLUMNS.filter((c) => c.required && columns[c.key] === undefined).map((c) => c.ar);
  if (missingRequired.length > 0) return { columns, missingRequired, rows: [] };

  const seen = new Map<string, number>();
  const rows: ParsedRow[] = [];

  sheet.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (key: string) => (columns[key] === undefined ? '' : (cells[columns[key]] ?? '').trim());

    const values: Record<string, string> = {};
    for (const col of IMPORT_COLUMNS) values[col.key] = get(col.key);

    // A wholly empty line is spreadsheet debris, not a row somebody meant.
    if (Object.values(values).every((v) => v === '')) return;

    const problems: ParsedRow['problems'] = [];
    for (const col of IMPORT_COLUMNS) {
      if (col.required && !values[col.key]) {
        problems.push({ field: col.key, kind: 'MISSING', ar: `${col.ar} مفقود` });
      }
    }

    // The store's country keeps a foreign number's own code (RV136).
    const phone = values.customerPhone ? normalizePhoneNumber(values.customerPhone, countryCode) : null;
    if (values.customerPhone && !phone) {
      problems.push({ field: 'customerPhone', kind: 'BAD_PHONE', ar: 'رقم الهاتف غير صالح' });
    }

    /**
     * THE TWO FIGURES, READ BY THE SHARED READER OR REFUSED BY NAME.
     *
     * This is where the file was worst, and the defect was not that the
     * reader was loose. It was that the reader REWROTE the cell before it
     * read it: a character class of the things it recognised, and every
     * other character deleted. A strip does not refuse — it produces a
     * different number and hands it on, and what is left always passes a
     * finiteness check. Measured on this file as it stood:
     *
     *     «٣٥٠٠» — three thousand five hundred typed on an Arabic keypad,
     *               in an Arabic-facing product — a price of ZERO, because
     *               Arabic-Indic digits are not in the class
     *     «3,5»   — 35, ten times the price
     *     «1e400» — 1400      «0x10» — 10      «12abc» — 12
     *
     * and the quantity beside it read «0x10» as SIXTEEN UNITS. Not one of
     * them was reported.
     *
     * AND NO DOOR COULD CATCH IT. `ImportOrdersDialog` posts the figure
     * THIS FILE produced to `POST /api/orders`, which then sees a clean,
     * well-formed number and has nothing to refuse. The mis-reading
     * happens before the request exists, so every hardening of that door
     * is upstream of nothing here.
     *
     * SO A CELL IS READ BY THE ONE SHARED READER OR IT IS REFUSED — per
     * row, with the cell quoted back, which is the shape this file
     * already uses for a phone number three digits short. Refusing the
     * whole FILE would send somebody back to fix ninety-eight good rows
     * blind in Excel. Importing the row FLAGGED would put a figure nobody
     * typed into an order, and a zero in a price column cannot be told
     * afterwards from a zero somebody meant. A thousand rows refused with
     * a reason is a Tuesday; a thousand rows silently zeroed is the
     * defect.
     *
     * `readTypedFigure` accepts Arabic-Indic digits — a change of SCRIPT,
     * in one named place, never a regex at a call site — and refuses
     * every other notation. So «٣٥٠٠» is the 3500 the person meant, and
     * «3,5» is refused rather than guessed at: a comma is a decimal point
     * and a thousands separator at once, and the cell cannot say which.
     */
    const rawQty = values.quantity;
    const readQty = rawQty === '' ? 1 : readTypedFigure(rawQty);
    const quantity = readQty !== null && Number.isInteger(readQty) && readQty >= 1 ? readQty : null;
    if (quantity === null) {
      problems.push({
        field: 'quantity',
        kind: 'BAD_QUANTITY',
        ar:
          readQty === null
            ? `الكمية «${rawQty}» غير مقروءة — اكتبها بالأرقام وحدها`
            : `الكمية «${rawQty}» ليست عدداً صحيحاً أكبر من صفر`,
      });
    }

    const rawPrice = values.sellingPrice;
    const readPrice = rawPrice === '' ? null : readTypedFigure(rawPrice);
    const unreadablePrice = rawPrice !== '' && readPrice === null;
    const negativePrice = readPrice !== null && readPrice < 0;
    const sellingPrice = unreadablePrice || negativePrice ? null : readPrice;
    if (unreadablePrice || negativePrice) {
      problems.push({
        field: 'sellingPrice',
        kind: 'BAD_PRICE',
        /**
         * AND THE MESSAGE SAYS NOTHING ABOUT LEAVING THE CELL EMPTY. The first draft of it said «or leave it empty to take the
         * product's price», which was FALSE (an empty cell stored a price of 0 — see `sellingPrice` above), and an empty cell is
         * not an answer any more: the price column is required, and an empty one is `MISSING` — «السعر مفقود» — from the loop
         * over the required columns above.
         */
        ar: unreadablePrice
          ? `السعر «${rawPrice}» غير مقروء — اكتبه بالأرقام وحدها`
          : `السعر «${rawPrice}» سالب`,
      });
    }

    /**
     * THE SAME NUMBER TWICE IN ONE FILE.
     *
     * Reported, never refused: a household orders twice, and a marketer's
     * sheet legitimately carries the same customer on two lines. What the
     * person needs is to SEE it before pressing import, which is the whole
     * reason this returns a line number rather than a boolean.
     */
    let duplicateOfLine: number | null = null;
    if (phone) {
      const first = seen.get(phone);
      if (first !== undefined) duplicateOfLine = first;
      else seen.set(phone, line);
    }

    rows.push({
      line,
      values,
      phone,
      quantity,
      sellingPrice,
      problems,
      duplicateOfLine,
    });
  });

  return { columns, missingRequired: [], rows };
}

/** A row nobody has to fix before it can become an order. */
export function isImportable(row: ParsedRow): boolean {
  return row.problems.length === 0;
}

/**
 * THE TEMPLATE, BUILT FROM THE SAME LIST THE PARSER READS — AND ITS EXAMPLE ROWS FROM THE STORE THAT DOWNLOADS IT.
 *
 * A template written by hand is a template that stops matching the parser
 * the first time a column is added — and the person following it has no way
 * to know. The BOM is there because Excel opens a UTF-8 CSV as mojibake
 * without it, and an Arabic header row is the first thing they see.
 *
 * THE OWNER, 21/10: «لما اعمل استثيراد طلبات ما في ملف مرجعي نموذج». The model file existed and was no use as a model: its one
 * example row was Syrian whoever downloaded it — a phone the rule of a Jordanian store refuses, a city that store does not
 * serve, and a product («كريم مرطّب») that no store has — so the model's own row came back «فيه نقص». And its price cell was
 * EMPTY, which `POST /api/orders` stored as a price of ZERO: following the template to the letter made a free order (the price
 * column is required now, so an empty cell is a refused row — `an-import-row-reaches-the-door.test.ts`). An example that fails
 * or that gives goods away teaches the wrong thing about the one file a person copies.
 *
 * So the example rows are made from what the downloading store really has: its own products at their own prices, a phone number
 * its country's rule accepts, and one of its own regions. With no product to give (an empty catalogue, or a caller who may not see
 * the whole one) there is NO example row, and the file is the header alone: nothing can be imported into a store with no product anyway,
 * and an invented example is exactly the defect.
 */
export interface TemplateRow {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  notes: string;
}

/** Three examples read better than one, and more is a catalogue. */
export const TEMPLATE_EXAMPLES = 3;

/** Made-up people and places — fictional, and the same for everybody: the file is a model, not a record. */
const EXAMPLE_NAMES = ['أحمد محمد', 'سارة علي', 'خالد يوسف'] as const;
const EXAMPLE_ADDRESSES = ['الحيّ — الشارع — رقم البناء', 'الحيّ — الشارع — رقم البناء — الطابق', 'قرب المعلم المعروف — الحيّ — الشارع'] as const;
const EXAMPLE_NOTES = ['يفضّل التسليم مساءً', '', 'الاتصال قبل الوصول'] as const;
/** One, two, one — so the sheet shows that the price is for the whole line. */
const EXAMPLE_QUANTITIES = [1, 2, 1] as const;

/** A name that Excel would run as a formula (it starts with = + - @ or a control character), or that a line-based reader would split. */
const UNSAFE_NAME = /^[=+\-@\t\r]|[\n\r]/;

/**
 * The example rows for one store.
 *
 *   · a product is used only if it has a real price (a price of zero is the free-order trap) and a name that is a plain name:
 *     one that starts with `=`, `+`, `-` or `@` is a formula to Excel, and one with a line break would split the row;
 *   · the PRICE of a row is for the whole line, as the «السعر» column means: the product's price times the row's quantity,
 *     rounded to the currency's own minor unit;
 *   · the phone is the country's sample, with the last digit moved on per row so no two examples are «the same number twice».
 */
export function sampleRows(input: {
  /** A number the store's country accepts — `samplePhoneFor(country.code)`. */
  phone: string;
  /** One of the store's own regions, if it has any. */
  region: string | null;
  /** The currency's decimal places, to round a line price by. */
  minorUnit: number;
  products: ReadonlyArray<{ name: string; price: number }>;
}): TemplateRow[] {
  const usable = input.products.filter((p) => p.name.trim() !== '' && !UNSAFE_NAME.test(p.name) && Number.isFinite(p.price) && p.price > 0);
  return usable.slice(0, TEMPLATE_EXAMPLES).map((p, i) => {
    const quantity = EXAMPLE_QUANTITIES[i];
    return {
      customerName: EXAMPLE_NAMES[i],
      customerPhone: input.phone.slice(0, -1) + String((Number(input.phone.slice(-1)) + i) % 10),
      customerAddress: EXAMPLE_ADDRESSES[i],
      customerCity: input.region ?? '',
      productName: p.name.trim(),
      quantity,
      sellingPrice: roundMinor(p.price * quantity, input.minorUnit),
      notes: EXAMPLE_NOTES[i],
    };
  });
}

/** One CSV cell: quoted when it holds a comma, a quote or a line break, with a quote doubled — the reader (`splitCsvLine`) undoes exactly this. */
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function importTemplateCsv(rows: readonly TemplateRow[] = []): string {
  const header = IMPORT_COLUMNS.map((c) => csvCell(c.required ? `${c.ar} *` : c.ar)).join(',');
  const lines = rows.map((r) =>
    IMPORT_COLUMNS.map((c) => {
      // Every column the parser reads has a cell, in the parser's own order; one this row does not carry (the alternative phone) is empty.
      const v = (r as unknown as Record<string, string | number | undefined>)[c.key];
      return csvCell(v === undefined ? '' : String(v));
    }).join(',')
  );
  return `﻿${[header, ...lines].join('\n')}\n`;
}
