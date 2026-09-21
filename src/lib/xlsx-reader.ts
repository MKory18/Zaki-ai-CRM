import { inflateRawSync } from 'node:zlib';

/**
 * A minimal .xlsx reader: enough to turn a courier's statement into rows.
 *
 * Deliberately hand-written rather than pulled from a package. This path
 * parses a file a third party sends us and the settlement numbers come
 * straight out of it, so the parsing surface is kept small, auditable and
 * dependency-free. It reads the sheet and the shared-string table and
 * nothing else: no formulas are evaluated, no external references followed,
 * no styles or macros touched.
 *
 * An .xlsx is a ZIP of XML. We read the central directory, inflate the two
 * entries we need, and pull the cell values out.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const EOCD = 0x06054b50;

/** Guards against a crafted archive claiming an absurd expansion. */
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  // The EOCD sits at the end, after a comment of up to 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('الملف ليس ملف إكسل صالحاً');

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_HEADER) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): string {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new Error('الملف كبير جداً');
  }
  const head = entry.localOffset;
  if (buf.readUInt32LE(head) !== LOCAL_HEADER) throw new Error('الملف تالف');
  const nameLen = buf.readUInt16LE(head + 26);
  const extraLen = buf.readUInt16LE(head + 28);
  const start = head + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return raw.toString('utf8');
  if (entry.method === 8) return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }).toString('utf8');
  throw new Error('ضغط غير مدعوم داخل الملف');
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function decodeXml(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** The shared-string table: most cell text lives here, referenced by index. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.split('<si>').slice(1)) {
    const chunk = si.slice(0, si.indexOf('</si>'));
    // A string may be split into several runs; concatenate their <t> parts.
    const parts = [...chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    out.push(parts.join(''));
  }
  return out;
}

/** "BC12" → 54 (zero-based column index). */
function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowXml of xml.split('<row').slice(1)) {
    const body = rowXml.slice(0, rowXml.indexOf('</row>') === -1 ? undefined : rowXml.indexOf('</row>'));
    const cells: string[] = [];

    // Either a self-closing empty cell or one with content. Written as one
    // alternation on purpose: with an optional trailing group, an empty
    // <c r="C2"/> swallowed the NEXT cell's content up to its </c>, which
    // shifted every value after it one column to the left.
    for (const m of body.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const inner = m[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1];

      let value = '';
      if (type === 'inlineStr') {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join('');
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          value = type === 's' ? (shared[Number(v)] ?? '') : decodeXml(v);
        }
      }

      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push('');
      cells[at] = value;
    }

    rows.push(cells);
  }

  return rows;
}

/** Rows of the first worksheet, as strings. Empty cells come back as ''. */
export function readXlsxRows(data: Buffer | Uint8Array): string[][] {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const entries = readCentralDirectory(buf);

  const sheet =
    entries.find((e) => /^xl\/worksheets\/sheet1\.xml$/i.test(e.name)) ??
    entries.find((e) => /^xl\/worksheets\/.+\.xml$/i.test(e.name));
  if (!sheet) throw new Error('لا توجد ورقة عمل داخل الملف');

  const sharedEntry = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name));
  const shared = sharedEntry ? parseSharedStrings(readEntry(buf, sharedEntry)) : [];

  return parseSheet(readEntry(buf, sheet), shared);
}

/** True when the bytes look like a ZIP container, which every .xlsx is. */
export function looksLikeXlsx(data: Buffer | Uint8Array): boolean {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.length > 4 && buf.readUInt32LE(0) === LOCAL_HEADER;
}
