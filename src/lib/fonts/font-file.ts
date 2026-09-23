/**
 * WHAT A FONT FILE SAYS ABOUT ITSELF.
 *
 * Every OpenType file carries a `name` table, and in it the designer writes
 * the family name, the copyright, and — very often — the licence in full.
 * Name ID 0 is the copyright, 13 the licence, 14 a URL to it.
 *
 * We read it for two reasons.
 *
 * The first is ordinary: a seller who uploads `1 (3).woff2` should see
 * "thmanyah sans Light" in the list, not the filename, and the weight should
 * be worked out rather than asked for.
 *
 * The second matters more. Most Arabic type is licensed for use on your own
 * machine and forbids serving the file from a website — Boutros, BigVesta,
 * RAOOF and thmanyah all say so, in these very bytes. A seller who uploads
 * one of those is usually not defying the licence; they have never read it,
 * because it is buried inside a binary. So the uploader reads it out and
 * shows it to them, in their own language, before they publish.
 *
 * This does not block anything. The seller owns the store and the decision.
 * It only means the decision is an informed one.
 */

const WOFF2 = 0x774f4632; // 'wOF2'
const WOFF1 = 0x774f4646; // 'wOFF'
const OTTO = 0x4f54544f; // 'OTTO' — CFF outlines
const TRUE = 0x00010000; // TrueType outlines
const TTCF = 0x74746366; // 'ttcf' — collection

export interface FontFacts {
  /** The family the browser will match on, e.g. "thmanyah sans". */
  family: string;
  /** The full name, e.g. "thmanyah sans Light". */
  fullName: string;
  /** 100–900, read from the file or inferred from the style name. */
  weight: number;
  italic: boolean;
  /** The designer's copyright line, when present. */
  copyright: string;
  /** The licence text the designer embedded, when present. */
  licence: string;
  /** Where the designer says the licence lives. */
  licenceUrl: string;
  format: 'woff2' | 'woff' | 'otf' | 'ttf';
}

/** The four bytes at the start, which decide whether this is a font at all. */
export function detectFontFormat(buf: Buffer): FontFacts['format'] | null {
  if (buf.length < 8) return null;
  const tag = buf.readUInt32BE(0);
  if (tag === WOFF2) return 'woff2';
  if (tag === WOFF1) return 'woff';
  if (tag === OTTO) return 'otf';
  if (tag === TRUE || tag === 0x74727565) return 'ttf';
  if (tag === TTCF) return 'ttf';
  return null;
}

/** Weights named rather than numbered, as most style names do it. */
const STYLE_WEIGHT: [RegExp, number][] = [
  [/\b(thin|hairline)\b/i, 100],
  [/\b(extra\s*light|ultra\s*light|extralight)\b/i, 200],
  [/\blight\b/i, 300],
  [/\b(regular|normal|book)\b/i, 400],
  [/\bmedium\b/i, 500],
  [/\b(semi\s*bold|demi\s*bold|semibold|demibold)\b/i, 600],
  [/\bbold\b/i, 700],
  [/\b(extra\s*bold|ultra\s*bold|extrabold)\b/i, 800],
  [/\b(black|heavy)\b/i, 900],
];

function weightFromStyle(name: string): number | null {
  // Longest match wins: "extra bold" must not be read as "bold".
  let best: { w: number; len: number } | null = null;
  for (const [re, w] of STYLE_WEIGHT) {
    const m = re.exec(name);
    if (m && (!best || m[0].length > best.len)) best = { w, len: m[0].length };
  }
  return best ? best.w : null;
}

interface RawTables {
  name?: Buffer;
  os2?: Buffer;
  head?: Buffer;
}

/**
 * The table directory of an sfnt file. woff2 is Brotli-compressed with its
 * own table layout, so it is not read here — the upload path asks the caller
 * to send an uncompressed sibling when it needs the facts.
 */
function readTables(buf: Buffer): RawTables | null {
  let off = 0;
  if (buf.readUInt32BE(0) === TTCF) {
    if (buf.length < 16) return null;
    off = buf.readUInt32BE(12);
  }
  if (buf.length < off + 12) return null;
  const numTables = buf.readUInt16BE(off + 4);
  // A directory claiming thousands of tables is not a font we should walk.
  if (numTables > 512) return null;
  const out: RawTables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = off + 12 + i * 16;
    if (buf.length < rec + 16) return null;
    const tag = buf.toString('latin1', rec, rec + 4);
    const tOff = buf.readUInt32BE(rec + 8);
    const tLen = buf.readUInt32BE(rec + 12);
    if (tOff + tLen > buf.length) continue; // truncated table: skip, do not throw
    if (tag === 'name') out.name = buf.subarray(tOff, tOff + tLen);
    else if (tag === 'OS/2') out.os2 = buf.subarray(tOff, tOff + tLen);
    else if (tag === 'head') out.head = buf.subarray(tOff, tOff + tLen);
  }
  return out;
}

/** The name records we care about, longest value per id. */
function readNames(name: Buffer): Record<number, string> {
  const out: Record<number, string> = {};
  if (name.length < 6) return out;
  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  if (count > 4096) return out;
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (name.length < rec + 12) break;
    const platformId = name.readUInt16BE(rec);
    const nameId = name.readUInt16BE(rec + 6);
    const len = name.readUInt16BE(rec + 8);
    const off = name.readUInt16BE(rec + 10);
    const start = stringOffset + off;
    if (start + len > name.length) continue;
    const raw = name.subarray(start, start + len);
    // Platform 3 (Windows) and 0 (Unicode) are UTF-16BE; 1 (Mac) is 8-bit.
    const value = platformId === 3 || platformId === 0 ? swapUtf16(raw) : raw.toString('latin1');
    const clean = value.replace(/\0/g, '').trim();
    if (!clean) continue;
    if (!out[nameId] || clean.length > out[nameId].length) out[nameId] = clean;
  }
  return out;
}

/** Node has no utf16be decoder; the bytes are swapped and read as LE. */
function swapUtf16(raw: Buffer): string {
  const even = raw.length - (raw.length % 2);
  const swapped = Buffer.allocUnsafe(even);
  for (let i = 0; i < even; i += 2) {
    swapped[i] = raw[i + 1];
    swapped[i + 1] = raw[i];
  }
  return swapped.toString('utf16le');
}

/**
 * Everything we can learn from the bytes.
 *
 * `null` when the file is not a font at all. woff2 carries its tables
 * Brotli-compressed, so it yields only the format — the caller then falls
 * back to the filename for a label, and says so.
 */
export function readFontFacts(buf: Buffer): FontFacts | null {
  const format = detectFontFormat(buf);
  if (!format) return null;

  const base: FontFacts = {
    family: '',
    fullName: '',
    weight: 400,
    italic: false,
    copyright: '',
    licence: '',
    licenceUrl: '',
    format,
  };
  if (format === 'woff2' || format === 'woff') return base;

  const tables = readTables(buf);
  if (!tables?.name) return base;
  const names = readNames(tables.name);

  const family = names[16] || names[1] || '';
  const sub = names[17] || names[2] || '';
  const full = names[4] || [family, sub].filter(Boolean).join(' ');

  // OS/2 usWeightClass is authoritative when it is sane; a lot of free fonts
  // leave it at 400 for every weight, so a style name wins over a default.
  const os2Weight = tables.os2 && tables.os2.length >= 6 ? tables.os2.readUInt16BE(4) : 0;
  const named = weightFromStyle(sub) ?? weightFromStyle(full);
  let weight = 400;
  if (named != null) weight = named;
  else if (os2Weight >= 100 && os2Weight <= 1000) weight = Math.round(os2Weight / 100) * 100;

  const macStyle = tables.head && tables.head.length >= 46 ? tables.head.readUInt16BE(44) : 0;
  const italic = Boolean(macStyle & 0x2) || /\bitalic|oblique\b/i.test(sub);

  return {
    ...base,
    family,
    fullName: full,
    weight: Math.min(900, Math.max(100, weight)),
    italic,
    copyright: names[0] || '',
    licence: names[13] || '',
    licenceUrl: names[14] || '',
  };
}

/**
 * Does the designer's own text say this file may not be served from a site?
 *
 * Deliberately a hint and not a verdict. It looks for the phrases foundries
 * actually use, and it is wrong in both directions: a licence can forbid web
 * serving without any of these words, and an OFL notice mentions
 * "redistribute" while permitting exactly what we are doing.
 *
 * So it never blocks. It decides whether the seller is shown the licence
 * open or folded away — and the full text is always one click from them.
 */
export function looksRestricted(facts: FontFacts): boolean {
  const text = `${facts.copyright} ${facts.licence}`.toLowerCase();
  if (!text.trim()) return false;
  // The one licence that exists to permit this. Say so and stop.
  if (/sil open font license|openfontlicense|scripts\.sil\.org\/ofl/.test(text)) return false;
  return [
    'may not be',
    'all rights reserved',
    'license agreement',
    'may not copy',
    'not be redistributed',
    'personal use',
    'single station',
    'web embedding',
    'may not distribute',
  ].some((p) => text.includes(p));
}
