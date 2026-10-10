import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PROOF_MIMES,
  MAX_PROOF_BYTES,
  describeProof,
  proofDisposition,
  proofDispositionHeader,
  proofHash,
  proofName,
  proofStorageKey,
  safeProofName,
  sniffProof,
} from './settlement-proof';
import { isSafeStorageKey } from './storage';

/**
 * THE PAPER BEHIND A COLLECTION.
 *
 * A courier hands over money, a figure goes into a wallet, and until now
 * the only record of WHY that figure is that figure was the figure itself.
 * A receipt for 1,240 and a receipt for 1,420 look equally true a month
 * later. So the slip is kept with the row.
 *
 * EVERY FILE IN THIS TEST IS BUILT FROM ITS REAL FIRST BYTES rather than
 * from a string that stands in for one. A fixture that is not actually a
 * JPEG proves that the function accepted a fixture — which is the lesson
 * this repository has already paid for once, in the partial-delivery
 * review: a test whose input could not occur is a green tick over nothing.
 */

/** The real magic bytes, padded to a length the sniffer will look at. */
const pad = (head: number[], n = 64) => Buffer.concat([Buffer.from(head), Buffer.alloc(n)]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(52)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(55)]);

describe('Ⅰ · what the file IS, read from its bytes', () => {
  it('knows the four it accepts', () => {
    expect(sniffProof(JPEG)).toBe('image/jpeg');
    expect(sniffProof(PNG)).toBe('image/png');
    expect(sniffProof(WEBP)).toBe('image/webp');
    expect(sniffProof(PDF)).toBe('application/pdf');
  });

  it('and the four it accepts are the four it SAYS it accepts', () => {
    // A list in a comment and a list in an `if` drift. These are the same
    // list, so a fifth type added to one of them fails here.
    const sniffed = [JPEG, PNG, WEBP, PDF].map((b) => sniffProof(b));
    expect([...ALLOWED_PROOF_MIMES].sort()).toEqual([...new Set(sniffed)].sort());
  });

  it('refuses a name that lies about the bytes', () => {
    // The browser will happily say `image/jpeg` for this. The bytes say zip.
    const zip = pad([0x50, 0x4b, 0x03, 0x04]);
    expect(sniffProof(zip)).toBeNull();
    expect(() => describeProof(zip, 'إيصال.jpg')).toThrow(/ليس صورة ولا PDF/);
  });

  it('refuses an SVG, because an SVG is a document that can carry script', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffProof(svg)).toBeNull();
  });

  it('refuses a PDF with rubbish in front of it', () => {
    /*
     * A viewer tolerates leading bytes before `%PDF-`; a payment record
     * must not, because that tolerance is exactly how a file that is two
     * things at once — an HTML page to a browser, a PDF to a viewer — gets
     * stored as a proof.
     */
    const smuggled = Buffer.concat([Buffer.from('<html>x</html>'), PDF]);
    expect(sniffProof(smuggled)).toBeNull();
  });

  it('and refuses an empty file with its own sentence', () => {
    expect(() => describeProof(Buffer.alloc(0), 'x.jpg')).toThrow('الملف فارغ');
  });
});

describe('Ⅱ · the size, and the sentence a person reads', () => {
  it('accepts a file right on the limit', () => {
    const atLimit = Buffer.concat([JPEG, Buffer.alloc(MAX_PROOF_BYTES - JPEG.length)]);
    expect(atLimit.length).toBe(MAX_PROOF_BYTES);
    expect(describeProof(atLimit, 'slip.jpg').sizeBytes).toBe(MAX_PROOF_BYTES);
  });

  it('and refuses one byte past it, in megabytes', () => {
    const over = Buffer.concat([JPEG, Buffer.alloc(MAX_PROOF_BYTES + 1 - JPEG.length)]);
    expect(over.length).toBe(MAX_PROOF_BYTES + 1);
    // The person is holding a 9 MB phone photo. «4194305 bytes» tells them
    // nothing; «4 ميجابايت» tells them what to do about it.
    expect(() => describeProof(over, 'slip.jpg')).toThrow('حجم الملف يتجاوز الحد المسموح (4 ميجابايت)');
  });

  it('and the size is checked BEFORE the bytes are sniffed', () => {
    // Otherwise a 50 MB file is read and hashed to be told it is too big.
    const huge = Buffer.alloc(MAX_PROOF_BYTES + 1); // not any known type
    expect(() => describeProof(huge, 'x.bin')).toThrow(/يتجاوز الحد المسموح/);
  });
});

describe('Ⅲ · the hash, which is what makes a stored proof worth anything', () => {
  it('is the SHA-256 of the bytes', () => {
    // Known value, so a change of algorithm is visible rather than merely
    // different: sha256 of the three bytes `abc`.
    expect(proofHash(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('and one changed byte is a different proof', () => {
    const a = Buffer.from(JPEG);
    const b = Buffer.from(JPEG);
    b[40] = 0x01;
    expect(proofHash(a)).not.toBe(proofHash(b));
  });

  it('and describeProof reports that same hash', () => {
    expect(describeProof(PDF, 'bank.pdf').hash).toBe(proofHash(PDF));
  });
});

describe('Ⅳ · the name that comes back out — a header boundary', () => {
  it('keeps an Arabic name, because that is what the owner calls his files', () => {
    expect(safeProofName('إيصال أرامكس.jpg', 'image/jpeg')).toBe('إيصال أرامكس.jpg');
  });

  it('and gives the extension the bytes deserve, not the one typed', () => {
    // A bank PDF saved as `.jpg` must not come back claiming to be a photo.
    expect(safeProofName('slip.jpg', 'application/pdf')).toBe('slip.pdf');
    expect(safeProofName('حوالة', 'application/pdf')).toBe('حوالة.pdf');
  });

  it('strips a path, so a name is never a route', () => {
    expect(safeProofName('../../etc/passwd.png', 'image/png')).toBe('passwd.png');
    expect(safeProofName('C:\\Users\\x\\slip.png', 'image/png')).toBe('slip.png');
  });

  it('and nothing survives that could end a header or start another', () => {
    const nasty = 'a"b;c\r\nX-Evil: 1.jpg';
    const out = safeProofName(nasty, 'image/jpeg');
    for (const ch of ['"', ';', '\r', '\n']) {
      expect(out, `بقي ${JSON.stringify(ch)} في الاسم`).not.toContain(ch);
    }
  });

  it('and a name that is only rubbish still gets a name', () => {
    expect(safeProofName('..', 'image/webp')).toBe('إثبات-التحصيل.webp');
    expect(safeProofName('   ', 'image/webp')).toBe('إثبات-التحصيل.webp');
  });

  it('and the built header carries both forms of the name', () => {
    const h = proofDispositionHeader('image/jpeg', 'إيصال أرامكس.jpg');
    // The ASCII fallback for anything that cannot read the starred form…
    expect(h).toMatch(/filename="[\x20-\x7e]*"/);
    // …and the real name, percent-encoded as RFC 5987 asks.
    expect(h).toContain(`filename*=UTF-8''${encodeURIComponent('إيصال أرامكس.jpg')}`);
    // No raw non-ASCII anywhere in the header value.
    expect(h.replace(/filename\*=UTF-8''[^;]*/, '')).toMatch(/^[\x20-\x7e]*$/);
  });

  it('and a quote cannot break out of the ASCII fallback either', () => {
    const h = proofDispositionHeader('image/jpeg', 'a"b.jpg');
    expect(/filename="([^"]*)"/.exec(h)![1]).not.toContain('"');
  });
});

describe('Ⅳ.b · and the owner is the one who names it — «لازم أنا اسميه»', () => {
  /**
   * A phone calls its photos `IMG_20261010_143052.jpg`, and a month later
   * that tells nobody which handover it was. So the owner's name wins.
   *
   * OFFERED, NOT DEMANDED: a required field stands between a person and
   * recording money that has already arrived, and a receipt that cannot be
   * saved is worse than a receipt called `IMG_2026…`.
   */
  it('the typed name beats the file’s own', () => {
    expect(proofName('image/jpeg', 'IMG_20261010_143052.jpg', 'تحصيل أرامكس ١٠ تشرين')).toBe(
      'تحصيل أرامكس ١٠ تشرين.jpg'
    );
  });

  it('and the owner is not asked to know the extension', () => {
    // They type «حوالة بنكية»; the bytes say PDF; the name gets `.pdf`.
    expect(proofName('application/pdf', 'scan001.jpg', 'حوالة بنكية')).toBe('حوالة بنكية.pdf');
  });

  it('and typing nothing keeps the file’s own name', () => {
    expect(proofName('image/jpeg', 'IMG_4821.jpg')).toBe('IMG_4821.jpg');
    expect(proofName('image/jpeg', 'IMG_4821.jpg', '')).toBe('IMG_4821.jpg');
  });

  it('and typing only spaces is typing nothing', () => {
    // The distinction a sanitiser that substitutes its own fallback cannot
    // make — which is why `clean` may return empty and the caller decides.
    expect(proofName('image/jpeg', 'IMG_4821.jpg', '   ')).toBe('IMG_4821.jpg');
    expect(proofName('image/jpeg', 'IMG_4821.jpg', '..')).toBe('IMG_4821.jpg');
  });

  it('and the owner’s name is cleaned too, because the header does not care who typed it', () => {
    const out = proofName('image/jpeg', 'x.jpg', 'إيصال"؛\r\nX-Evil: 1');
    for (const ch of ['"', ';', '\r', '\n']) {
      expect(out, `بقي ${JSON.stringify(ch)} في الاسم المكتوب بيد`).not.toContain(ch);
    }
    expect(out).toContain('إيصال');
  });

  it('and a typed name is never a path', () => {
    expect(proofName('image/png', 'x.png', '../../etc/passwd')).toBe('passwd.png');
  });

  it('and describeProof passes the chosen name through', () => {
    expect(describeProof(PDF, 'scan001.pdf', 'حوالة أرامكس').name).toBe('حوالة أرامكس.pdf');
    expect(describeProof(PDF, 'scan001.pdf').name).toBe('scan001.pdf');
  });
});

describe('Ⅴ · a PDF is downloaded, an image is shown', () => {
  /**
   * A PDF may carry JavaScript, and served inline from this product's own
   * origin the viewer runs it HERE. The bytes were chosen by whoever handed
   * over the money. An image cannot do that, and somebody checking a
   * collection wants to see the slip.
   */
  it('inline for the three image types', () => {
    expect(proofDisposition('image/jpeg')).toBe('inline');
    expect(proofDisposition('image/png')).toBe('inline');
    expect(proofDisposition('image/webp')).toBe('inline');
  });

  it('and attachment for the PDF', () => {
    expect(proofDisposition('application/pdf')).toBe('attachment');
    expect(proofDispositionHeader('application/pdf', 'bank.pdf')).toMatch(/^attachment;/);
  });

  it('and the rule is on the TYPE, not on the name', () => {
    // A PDF named `.jpg` was renamed to `.pdf` by Ⅳ; its disposition comes
    // from the sniffed type, so it is still a download.
    const facts = describeProof(PDF, 'slip.jpg');
    expect(facts.name).toBe('slip.pdf');
    expect(proofDisposition(facts.mime)).toBe('attachment');
  });
});

describe('Ⅵ · where it is written, and the caller never chooses', () => {
  const key = proofStorageKey('c-1', 's-2', 'r-3', 'image/jpeg');

  it('is namespaced by company, like every upload in this product', () => {
    expect(key).toBe('companies/c-1/settlement/s-2/receipts/r-3.jpg');
  });

  it('and is named after the receipt, never after the uploaded file', () => {
    // The uploaded name came from outside. It must not reach a path at all,
    // so it is not an argument here — this is what makes traversal moot
    // rather than defended against.
    expect(proofStorageKey.length, 'توقيعُ الدالةِ يأخذُ اسمَ الملف').toBe(4);
    expect(key).not.toContain('..');
  });

  it('and one receipt has one proof, so replacing a bad photo replaces it', () => {
    expect(proofStorageKey('c-1', 's-2', 'r-3', 'image/jpeg')).toBe(key);
  });

  it('and every type lands inside the uploads root', () => {
    for (const mime of ALLOWED_PROOF_MIMES) {
      const k = proofStorageKey('c-1', 's-2', 'r-3', mime);
      expect(isSafeStorageKey(k), `${mime}: مفتاحٌ يَخرُجُ من جذرِ التخزين`).toBe(true);
    }
  });
});
