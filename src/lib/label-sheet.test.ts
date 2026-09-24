import { describe, it, expect } from 'vitest';
import { barcodeSvg, renderLabelSheet, labelsPerPage, PRINT_CHUNK, type LabelView } from './label-sheet';
import { code128Bars } from './labels';

const label = (i: number, over: Partial<LabelView> = {}): LabelView => ({
  courier: 'LogesTechs',
  ref: `SY-${10000 + i}`,
  courierCode: `JO${7000000000 + i}`,
  name: 'محمد الشمري',
  phone: '0791234567',
  place: 'عمان — شارع المدينة',
  items: ['منتج × 2'],
  cod: '32.500 JOD',
  qrSvg: '<svg></svg>',
  ...over,
});
const thermal = { width: 100, height: 150 };
const many = (n: number) => Array.from({ length: n }, (_, i) => label(i));

describe('the barcode — one element, the same bars', () => {
  it('draws every dark bar at the position and width Code 128 gives it', () => {
    // The courier's scanner reads widths. A path that moved or merged one
    // bar would print fine and scan as a different parcel.
    const value = 'JO7000000123';
    const bars = code128Bars(value);
    const expected: [number, number][] = [];
    let x = 0;
    bars.forEach((w, i) => {
      if (i % 2 === 0) expected.push([x, w]);
      x += w;
    });

    const d = /d="([^"]+)"/.exec(barcodeSvg(value, 68, 14))![1];
    const drawn = [...d.matchAll(/M(\d+) 0h(\d+)v10h-\d+z/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(drawn).toEqual(expected);
  });

  it('is a single element, not one per bar', () => {
    const svg = barcodeSvg('JO7000000123', 68, 14);
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).not.toContain('<rect');
  });

  it('keeps the edges hard so a scanner does not read grey as a width', () => {
    expect(barcodeSvg('X1', 68, 14)).toContain('shape-rendering="crispEdges"');
  });
});

describe('the sheet', () => {
  it('holds no rect anywhere, however many labels', () => {
    expect(renderLabelSheet(many(200), thermal)).not.toContain('<rect');
  });

  it('puts one label on each thermal page and several on office paper', () => {
    expect(labelsPerPage(thermal)).toBe(1);
    // A4 with 100×70 labels: two across, four down.
    expect(labelsPerPage({ width: 100, height: 70, sheetWidth: 210, sheetHeight: 297 })).toBe(8);
    // Paper smaller than the label still gets one per page rather than none.
    expect(labelsPerPage({ width: 150, height: 150, sheetWidth: 100, sheetHeight: 100 })).toBe(1);
  });

  it('wraps each page on its own, so pagination is not measured label by label', () => {
    const html = renderLabelSheet(many(16), { width: 100, height: 70, sheetWidth: 210, sheetHeight: 297 });
    expect(html.match(/class="page"/g)).toHaveLength(2);
  });

  it('escapes whatever a customer typed', () => {
    const html = renderLabelSheet([label(0, { name: '<script>alert(1)</script>', place: '"><img src=x>' })], thermal);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('never shows the toolbar on paper', () => {
    const html = renderLabelSheet(many(3), thermal);
    expect(html).toMatch(/@media print \{[\s\S]*\.bar \{ display: none; \}/);
  });
});

describe('a small batch prints as it always did', () => {
  it('opens the print dialog by itself, after layout rather than on load', () => {
    const html = renderLabelSheet(many(PRINT_CHUNK), thermal);
    expect(html).toContain('requestAnimationFrame');
    // print() from onload fired before layout settled — that was the freeze.
    expect(html).not.toContain('onload="window.print()"');
  });

  it('offers no runs to choose from', () => {
    expect(renderLabelSheet(many(PRINT_CHUNK), thermal)).not.toContain('class="run"');
  });
});

describe('a large batch is printed in runs', () => {
  it('does NOT open two hundred pages by itself', () => {
    // The negative test for the freeze: a large batch that auto-printed
    // would rasterise every page in one blocking pass again.
    const html = renderLabelSheet(many(200), thermal);
    expect(html).not.toContain("addEventListener('load'");
  });

  it('offers every run, and together they cover every label exactly once', () => {
    const html = renderLabelSheet(many(173), thermal);
    const runs = [...html.matchAll(/data-print-run="(\d+)">(\d+)–(\d+)</g)].map((m) => [Number(m[2]), Number(m[3])]);
    expect(runs).toEqual([[1, 50], [51, 100], [101, 150], [151, 173]]);
  });

  it('hides every page outside the chosen run when printing', () => {
    const html = renderLabelSheet(many(120), thermal);
    for (const r of [0, 1, 2]) {
      expect(html).toContain(`body[data-run="${r}"] .page:not([data-run="${r}"]) { display: none; }`);
    }
  });

  it('tags each page with the run of its first label', () => {
    const html = renderLabelSheet(many(120), thermal);
    const tags = [...html.matchAll(/class="page" data-run="(\d+)"/g)].map((m) => Number(m[1]));
    expect(tags.filter((t) => t === 0)).toHaveLength(50);
    expect(tags.filter((t) => t === 1)).toHaveLength(50);
    expect(tags.filter((t) => t === 2)).toHaveLength(20);
  });

  it('still lets the operator print everything at once if they choose to', () => {
    expect(renderLabelSheet(many(200), thermal)).toContain('data-print-run="all"');
  });
});
