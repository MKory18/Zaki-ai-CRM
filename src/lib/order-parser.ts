/**
 * Free-text Order Intake Parser (AI + deterministic fallback)
 * Parses messages like:
 * الاسم: عبدالله عبدالقادر عبدالعال
 * الرقم: 0936654998
 * اسم المحافظة: سووريا
 * العنوان: بانياس المدينة
 * الطلب ( المنتج ): كريم علاج فطريات الأظافر
 * الكمية: 1
 * السعر: 20$
 * الملاحظات: -
 * اسم الصفحة: الشيت
 */

export interface ParsedOrder {
  customerName: string;
  phone: string;
  governorate: string;
  address: string;
  productQuery: string;
  quantity: number;
  price: number | null;
  notes: string;
  source: string;
}

/** Normalize Arabic text: strip diacritics, unify alef/ya/ta-marbuta, remove tatweel */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670]/g, '') // diacritics
    .replace(/\u0640/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

const FIELD_PATTERNS: Array<{ key: keyof ParsedOrder; regex: RegExp }> = [
  { key: 'customerName', regex: /(?:الاسم|اسم الزبون|اسم العميل|الاسم الكامل)\s*[:：-]\s*(.+)/i },
  { key: 'phone', regex: /(?:الرقم|رقم الهاتف|الهاتف|رقم الموبايل|رقم الواتس|واتس)\s*[:：-]\s*([0-9+\-\s()]{7,20})/ },
  { key: 'governorate', regex: /(?:اسم المحافظة|المحافظة|المحافظه)\s*[:：-]\s*(.+)/ },
  { key: 'address', regex: /(?:العنوان|عنوان التوصيل|السكن)\s*[:：-]\s*(.+)/ },
  { key: 'productQuery', regex: /(?:الطلب\s*\(\s*[^)]*\s*\)|الطلب|اسم المنتج|المنتج المطلوب|المنتج|المطلوب)\s*[:：-]\s*(.+)/ },
  { key: 'quantity', regex: /(?:الكمية|الكميه|العدد)\s*[:：-]\s*([0-9]+)/ },
  { key: 'price', regex: /(?:السعر|المبلغ|الثمن)\s*[:：-]\s*([0-9]+(?:[.,][0-9]+)?)\s*\$?/ },
  { key: 'notes', regex: /(?:الملاحظات|ملاحظات|ملاحظة)\s*[:：-]\s*(.+)/ },
  { key: 'source', regex: /(?:اسم الصفحة|اسم الصفحه|الصفحة|الصفحه|المصدر)\s*[:：-]\s*(.+)/ },
];

export function parseOrderText(text: string): ParsedOrder {
  const lines = text.split(/\n|؛|;/);
  const result: ParsedOrder = {
    customerName: '',
    phone: '',
    governorate: '',
    address: '',
    productQuery: '',
    quantity: 1,
    price: null,
    notes: '',
    source: '',
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '-') continue;

    for (const { key, regex } of FIELD_PATTERNS) {
      if (result[key] && key !== 'quantity') continue;
      const m = trimmed.match(regex);
      if (m && m[1]) {
        const value = m[1].replace(/^\(|\)$/g, '').trim();
        if (value && value !== '-') {
          if (key === 'quantity') {
            result.quantity = parseInt(value, 10) || 1;
          } else if (key === 'price') {
            result.price = parseFloat(value.replace(',', '.')) || null;
          } else {
            (result[key] as string) = value;
          }
        }
      }
    }
  }

  // Fallback: find any phone number in the text
  if (!result.phone) {
    const phoneMatch = text.match(/\b(?:00962|00963|\+962|\+963)?0?[0-9]{9,10}\b/);
    if (phoneMatch) result.phone = phoneMatch[0];
  }

  // Clean name from inline labels
  result.customerName = result.customerName.replace(/^(?:الاسم|اسم الزبون)\s*/g, '').trim();
  result.source = result.source.trim() || 'الشيت';

  return result;
}

/** Fuzzy Arabic product matching against database product list */
export function matchProduct(
  query: string,
  products: Array<{ id: string; name: string; sku: string }>
): { id: string; name: string; score: number } | null {
  if (!query || products.length === 0) return null;

  const q = normalizeArabic(query);
  const qTokens = q.split(/[\s(),\-_]+/).filter((t) => t.length > 2);

  let best: { id: string; name: string; score: number } | null = null;

  for (const p of products) {
    const name = normalizeArabic(p.name);
    const nameTokens = new Set(name.split(/[\s(),\-_]+/).filter((t) => t.length > 2));

    let score = 0;

    // Exact substring match (strong signal)
    if (name.includes(q) || q.includes(name)) score += 60;

    // Token overlap
    for (const t of qTokens) {
      if (nameTokens.has(t)) score += 12;
      else if ([...nameTokens].some((nt) => nt.includes(t) || t.includes(nt))) score += 6;
    }

    // SKU match
    if (normalizeArabic(p.sku).includes(q)) score += 50;

    if (!best || score > best.score) {
      best = { id: p.id, name: p.name, score };
    }
  }

  // Threshold: require meaningful match
  if (!best || best.score < 12) return null;
  return best;
}
