import { describe, it, expect } from 'vitest';
import {
  barcodeSvg, labelsPerPage, renderLabelSheet, storeLogoForPrint, tierFor,
  PRINT_CHUNK, QUIET_MODULES, type LabelView, type SheetOptions,
} from './label-sheet';
import { code128Bars } from './labels';

const label = (i: number, over: Partial<LabelView> = {}): LabelView => ({
  orderId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  courier: 'LogesTechs',
  ref: `SY-${10000 + i}`,
  courierCode: `JO${7000000000 + i}`,
  name: 'محمد الشمري',
  phones: ['0791234567'],
  place: 'عمان — شارع المدينة',
  items: [{ name: 'منتج', qty: 2 }],
  note: null,
  cod: '32.500 JOD',
  qrSvg: '<svg class="q"></svg>',
  ...over,
});
const thermal = { width: 100, height: 150 };
const many = (n: number) => Array.from({ length: n }, (_, i) => label(i));
const opts = (over: Partial<SheetOptions> = {}): SheetOptions => ({
  store: { name: 'صحة بلس', logoUrl: null, supportPhone: null },
  mode: 'print',
  token: 'tok.en.value',
  stampUrl: '/api/ops/labels/printed',
  ...over,
});
const sheet = (labels: LabelView[], size = thermal, o: Partial<SheetOptions> = {}) =>
  renderLabelSheet(labels, size, opts(o));

describe('the barcode — one element, the same bars, quiet zones included', () => {
  it('draws every dark bar at the position and width Code 128 gives it, after the quiet zone', () => {
    const value = 'JO7000000123';
    const bars = code128Bars(value);
    const expected: [number, number][] = [];
    let x = QUIET_MODULES;
    bars.forEach((w, i) => {
      if (i % 2 === 0) expected.push([x, w]);
      x += w;
    });
    const d = /d="([^"]+)"/.exec(barcodeSvg(value, 14))![1];
    const drawn = [...d.matchAll(/M(\d+) 0h(\d+)v10h-\d+z/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(drawn).toEqual(expected);
  });

  it('leaves ten modules of white on each side', () => {
    const value = 'JO7000000123';
    const total = code128Bars(value).reduce((a, b) => a + b, 0);
    const svg = barcodeSvg(value, 14);
    expect(svg).toContain(`viewBox="0 0 ${total + 2 * QUIET_MODULES} 10"`);
    expect(svg).toContain(`M${QUIET_MODULES} 0h`);
  });

  it('is a single path, never one element per bar', () => {
    const svg = barcodeSvg('JO7000000123', 14);
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).not.toContain('<rect');
  });
});

describe('size decides what fits', () => {
  it('sorts the offered sizes into tiers', () => {
    expect(tierFor({ width: 60, height: 40 })).toBe('tiny');
    expect(tierFor({ width: 100, height: 100 })).toBe('compact');
    expect(tierFor({ width: 100, height: 150 })).toBe('standard');
    expect(tierFor({ width: 105, height: 148 })).toBe('standard');
    expect(tierFor({ width: 210, height: 148 })).toBe('large');
    expect(tierFor({ width: 210, height: 297 })).toBe('large');
  });

  it('keeps the barcode and the COD on the smallest label, and drops the QR and the item list', () => {
    const html = sheet([label(0)], { width: 60, height: 40 });
    expect(html).toContain('<figure class="barcode">');
    expect(html).toContain('32.500 JOD');
    expect(html).not.toContain('<figure class="qr">');
    expect(html).toContain('<p class="count">2 قطع</p>');
  });

  it('puts two landscape A5 on one A4', () => {
    expect(labelsPerPage({ width: 210, height: 148, sheetWidth: 210, sheetHeight: 297 })).toBe(2);
    expect(labelsPerPage({ width: 105, height: 148, sheetWidth: 210, sheetHeight: 297 })).toBe(4);
    expect(labelsPerPage(thermal)).toBe(1);
  });

  it('lays out the scannable rows so they cannot be squeezed out', () => {
    // Header, COD, codes and footer are auto rows; the recipient and the
    // contents are the rows allowed to shrink.
    expect(sheet([label(0)])).toContain('grid-template-rows: auto minmax(0, max-content) minmax(0, 1fr) auto auto auto');
  });
});

describe('what the label says', () => {
  it('lists the add-ons and marks them, so the packer puts them in', () => {
    const html = sheet([label(0, { items: [{ name: 'منتج', qty: 1 }, { name: 'مقشر', qty: 1, addOn: true }] })]);
    expect(html).toContain('مقشر');
    expect(html).toContain('<span class="tag">إضافة</span>');
  });

  it('says how many more when the list is longer than the label', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ name: `صنف ${i}`, qty: 1 }));
    expect(sheet([label(0, { items })])).toContain('و3 أصناف أخرى');
  });

  it('prints the customer’s note, and only when there is one', () => {
    expect(sheet([label(0, { note: 'اتصل قبل الوصول' })])).toContain('اتصل قبل الوصول');
    expect(sheet([label(0)])).not.toContain('class="note"');
  });

  it('shows both phone numbers when there are two', () => {
    expect(sheet([label(0, { phones: ['0791234567', '0781111111'] })])).toContain('0781111111');
  });

  it('carries the store’s name, logo and contact number', () => {
    const html = sheet([label(0)], thermal, {
      store: { name: 'صحة بلس', logoUrl: '/api/public/store-logo/s/x.webp', supportPhone: '0999000000' },
    });
    expect(html).toContain('صحة بلس');
    expect(html).toContain('src="/api/public/store-logo/s/x.webp"');
    expect(html).toContain('0999000000');
  });

  it('escapes whatever a customer typed', () => {
    const html = sheet([label(0, { name: '<script>alert(1)</script>', place: '"><img src=x>', note: '<b>x</b>' })]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('a store logo is drawn only from our own origin', () => {
  it('takes an uploaded logo', () => {
    expect(storeLogoForPrint('/api/public/store-logo/abc/x.webp')).toBe('/api/public/store-logo/abc/x.webp');
    expect(storeLogoForPrint('/api/media/companies/c/products/s/x.webp')).toBe('/api/media/companies/c/products/s/x.webp');
  });

  it('refuses one somebody typed that points elsewhere — the page carries addresses', () => {
    expect(storeLogoForPrint('https://tracker.example/logo.png')).toBeNull();
    expect(storeLogoForPrint('//evil.example/x.png')).toBeNull();
    expect(storeLogoForPrint('')).toBeNull();
    expect(storeLogoForPrint(null)).toBeNull();
  });
});

describe('printing commits; opening does not', () => {
  it('reports what is printed on beforeprint — which catches Ctrl+P too', () => {
    const html = sheet(many(3));
    expect(html).toContain("window.addEventListener('beforeprint'");
    expect(html).toContain('/api/ops/labels/printed');
  });

  it('never opens the print dialog by itself — opening the page commits nothing', () => {
    // The old sheet printed from onload, and the route stamped every order
    // when the page was merely requested.
    const html = sheet(many(3));
    expect(html).not.toContain("addEventListener('load'");
    expect(html).not.toContain('onload=');
  });

  it('reports nothing in PDF mode — saving a file is not printing a label', () => {
    const html = sheet(many(3), thermal, { mode: 'pdf' });
    expect(html).toContain('var PDF = true');
    expect(html).toContain('حفظ PDF');
  });

  it('tags every label with its order, so only the run actually printed is reported', () => {
    const html = sheet(many(3));
    expect(html.match(/data-order="/g)).toHaveLength(3);
  });

  it('names the orders that were left off, and why', () => {
    const html = sheet(many(1), thermal, { skipped: [{ orderNumber: 'SY-0012', reason: 'لم يُؤكَّد' }] });
    expect(html).toContain('SY-0012 (لم يُؤكَّد)');
  });
});

describe('a large batch is printed in runs', () => {
  it('offers every run, and together they cover every label exactly once', () => {
    const html = sheet(many(173));
    const runs = [...html.matchAll(/data-print-run="(\d+)">(\d+)–(\d+)</g)].map((m) => [Number(m[2]), Number(m[3])]);
    expect(runs).toEqual([[1, 50], [51, 100], [101, 150], [151, 173]]);
  });

  it('hides every page outside the chosen run when printing', () => {
    const html = sheet(many(120));
    for (const r of [0, 1, 2]) {
      expect(html).toContain(`body[data-run="${r}"] .page:not([data-run="${r}"]) { display: none; }`);
    }
  });

  it('has no runs in PDF mode — a PDF is one file of everything', () => {
    expect(sheet(many(173), thermal, { mode: 'pdf' })).not.toContain('class="run"');
  });

  it('keeps a small batch to one button', () => {
    expect(sheet(many(PRINT_CHUNK))).not.toContain('class="run"');
  });
});
