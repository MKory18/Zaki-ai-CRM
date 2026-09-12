/**
 * TELEGRAM ORDER PARSER — deterministic (no AI) natural-language parser.
 *
 * Extracts: customerName, phone, address, city, productText, quantity, notes.
 * Design contract:
 *   - `isOrder` + `confidence` are ADVISORY. Never used alone for a dangerous
 *     decision — the ingestion pipeline independently validates each field.
 *   - Non-order chit-chat (greetings, price questions, thanks) → isOrder=false.
 *   - Order-like but incomplete → isOrder=true with low confidence; the
 *     pipeline maps missing fields to NEEDS_REVIEW reasons.
 *
 * Reuses normalizeArabic() from the existing free-text order parser so
 * Arabic normalization stays consistent across the codebase.
 */
import { normalizeArabic } from '../order-parser';

export interface ParsedTelegramOrder {
  isOrder: boolean;
  confidence: number; // 0..1 advisory only
  customerName?: string;
  phone?: string;
  address?: string;
  city?: string;
  productText?: string;
  quantity?: number;
  notes?: string;
}

const MAX_TEXT_LENGTH = 4000;

/** Convert Arabic-Indic digits to ASCII. */
function toLatinDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30))
    .replace(/[\u06f0-\u06f9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x30));
}

/** Find the first plausible phone number in text (Syrian/Egyptian/Gulf friendly). */
export function extractPhone(text: string): string | null {
  const latin = toLatinDigits(text);
  const match = latin.match(/(?:\+?\d[\d\s\-()]{6,17}\d)/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  // Reasonable phone length without country code garbage (7..15 digits)
  if (digits.length < 7 || digits.length > 15) return null;
  // Reject pure-quantity/false positives: e.g. "3" already excluded by length
  return digits;
}

/** Extract quantity; returns undefined when none stated. Throws no errors. */
export function extractQuantity(text: string): number | undefined {
  const t = toLatinDigits(text);
  // labeled: الكمية: 5 / العدد: 3 / qty: 5
  const labeled = t.match(/(?:الكمية|الكميه|العدد)\s*[:：=\-]?\s*(\d{1,5})/);
  if (labeled) return parseInt(labeled[1], 10);
  // "×2" / "x2" / "*2" after product words
  const symbol = t.match(/[×x*]\s*(\d{1,4})/i);
  if (symbol) return parseInt(symbol[1], 10);
  // "2 كرتون|كراتين|قطعة|حبة|علبة" or "كمية 2"
  const unit = t.match(/(\d{1,4})\s*(?:كرتون|كراتين|علبة|علب|قطعة|قطع|حبة|حبات|عبوة)/);
  if (unit) return parseInt(unit[1], 10);
  const kammia = t.match(/كمية\s*(\d{1,4})/);
  if (kammia) return parseInt(kammia[1], 10);
  return undefined;
}

const LABEL_PATTERNS = {
  customerName: /(?:الاسم|اسم الزبون|اسم العميل|الاسم الكامل|الزبون|العميل)\s*[:：\-]\s*(.+)/,
  phone: /(?:الرقم|رقم الهاتف|الهاتف|رقم الموبايل|رقم الواتس|واتساب|واتس|التليفون)\s*[:：\-]?\s*([0-9+\-\s()]{7,20})/,
  address: /(?:العنوان|عنوان التوصيل|السكن|العنوان بالتفصيل)\s*[:：\-]\s*(.+)/,
  city: /(?:المدينة|المحافظة|المحافظه|المدينه)\s*[:：\-]\s*(.+)/,
  product: /(?:المنتج|اسم المنتج|الطلب|المطلوب|المنتج المطلوب)\s*[:：\-]\s*(.+)/,
  quantity: /(?:الكمية|الكميه|العدد)\s*[:：=\-]?\s*(\d{1,4})/,
  notes: /(?:الملاحظات|ملاحظات|ملاحظة)\s*[:：\-]\s*(.+)/,
};

/** Chit-chat / non-order signals. */
const NON_ORDER_PATTERNS: RegExp[] = [
  /^(?:السلام\s*عليكم|سلام|مرحبا|هلا|هاي|hi|hello)\b/i,
  /(?:شكرا|شكرًا|تم\s*التوصيل|وصل\s*الطلب|تم\s*الاستلام|مشكور)/,
  /(?:وين\s*طلبي|متى\s*يصل|وين\s*وصلت|فين\s*طلبي|متى\s*التوصيل|متى\s*يوصل)/,
  /(?:كم\s*(?:ال)?(?:سعر|ثمن)|بكم|السعر\s*كم|عندي\s*سؤال|سؤال|استفسار)/,
];

const ORDER_ACTION_WORDS = /(?:طلب|اطلب|بدي|ابي|أبغي|اريد|أريد|عاز|حدثني|اوريد|أوريد|دزلي|سجل\s*طلب|طلب\s*جديد|new\s*order)/i;

function clean(v: string | undefined | null): string | undefined {
  if (!v) return undefined;
  const t = v.replace(/^[-–—:：]+\s*/, '').trim();
  return t && t !== '-' ? t : undefined;
}

/**
 * Parse a Telegram message into a structured order draft.
 * Never throws; never performs I/O.
 */
export function parseTelegramOrderMessage(rawText: string): ParsedTelegramOrder {
  const text = (rawText || '').slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) return { isOrder: false, confidence: 0 };

  // 1) Labeled (structured) extraction first — strongest signal
  const lines = text.split(/\n|؛|;/);
  const out: ParsedTelegramOrder = { isOrder: false, confidence: 0 };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!out.customerName) {
      const m = trimmed.match(LABEL_PATTERNS.customerName);
      if (m) out.customerName = clean(m[1]);
    }
    if (!out.phone) {
      const m = trimmed.match(LABEL_PATTERNS.phone);
      if (m) {
        const digits = extractPhone(m[1]);
        if (digits) out.phone = digits;
      }
    }
    if (!out.address) {
      const m = trimmed.match(LABEL_PATTERNS.address);
      if (m) out.address = clean(m[1]);
    }
    if (!out.city) {
      const m = trimmed.match(LABEL_PATTERNS.city);
      if (m) out.city = clean(m[1]);
    }
    if (!out.productText) {
      const m = trimmed.match(LABEL_PATTERNS.product);
      if (m) out.productText = clean(m[1]);
    }
    if (!out.notes) {
      const m = trimmed.match(LABEL_PATTERNS.notes);
      if (m) out.notes = clean(m[1]);
    }
  }

  // 2) Phone fallback: any phone-shaped token anywhere
  if (!out.phone) out.phone = extractPhone(text) ?? undefined;

  // 3) Quantity
  const q = extractQuantity(text);
  if (q !== undefined) out.quantity = q;

  // 4) Non-order suppression: chit-chat with no product/no phone
  const hasPhone = Boolean(out.phone);
  const hasProduct = Boolean(out.productText);
  const hasName = Boolean(out.customerName);
  const isChitChat = NON_ORDER_PATTERNS.some((p) => p.test(normalizeArabic(text)));
  if (isChitChat && !hasProduct && !hasName) {
    return { isOrder: false, confidence: 0 };
  }

  // 5) Order-likeness scoring (advisory confidence only)
  let score = 0;
  if (hasPhone) score += 2;
  if (hasProduct) score += 2;
  if (hasName) score += 1;
  if (out.address) score += 1;
  if (out.quantity !== undefined) score += 1;
  if (ORDER_ACTION_WORDS.test(text)) score += 1;

  // 6) Confidence = fraction of expected fields present
  const fields = [hasPhone, hasProduct, hasName, Boolean(out.address), out.quantity !== undefined];
  out.confidence = Math.min(1, fields.filter(Boolean).length / fields.length);

  // 7) Free-format fallbacks (no labels): "أحمد 33334444 عرفات 2 ريان"
  if (!hasName && !hasProduct && hasPhone) {
    const candidate = extractFreeForm(text, out.phone!);
    if (candidate.customerName) {
      out.customerName = candidate.customerName;
      if (!out.productText) out.productText = candidate.productText;
      if (!out.address) out.address = candidate.address;
      if (out.quantity === undefined && candidate.quantity) out.quantity = candidate.quantity;
    }
  }

  // An order needs at minimum a phone OR (a product AND order intent/score)
  const isOrder = hasPhone || (hasProduct && ORDER_ACTION_WORDS.test(text)) || (hasProduct && score >= 3);
  if (!isOrder) return { isOrder: false, confidence: 0 };

  out.isOrder = true;
  return out;
}

// (fix-up helpers used above — kept module-private)

/** Pull name/product/address/quantity from an unlabeled single-line format. */
function extractFreeForm(text: string, phone: string): {
  customerName?: string; productText?: string; address?: string; quantity?: number;
} {
  const t = toLatinDigits(text);
  const idx = t.indexOf(phone);
  if (idx === -1) return {};
  const before = t.slice(0, idx).trim();
  const after = t.slice(idx + phone.length).trim();
  const tokens = after.split(/[\s,،\-–—]+/).filter(Boolean);

  // Leading number after phone = quantity
  let quantity: number | undefined;
  const rest: string[] = [];
  for (const tok of tokens) {
    if (quantity === undefined && /^\d{1,3}$/.test(tok)) { quantity = parseInt(tok, 10); continue; }
    rest.push(tok);
  }
  const remainder = rest.join(' ').trim();

  // Known Syrian/Egyptian-style city hints stay in address; simplest split:
  // remainder → address (and product matched later by product matching layer).
  return {
    customerName: before ? before.replace(/[-–—:،]+$/, '').trim() || undefined : undefined,
    quantity,
    address: remainder || undefined,
  };
}
