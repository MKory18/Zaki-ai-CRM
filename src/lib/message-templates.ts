import { db } from './db';

/**
 * WHAT WE SEND A CUSTOMER, AND HOW.
 *
 * Nothing here talks to a gateway. The SMS button opens the phone's own
 * messaging app, WhatsApp opens WhatsApp, the call button dials — all with
 * the text already written. That is deliberate: a gateway means an account,
 * a key, a per-message cost and a delivery report nobody reads, to solve a
 * problem that is really "typing the same sentence forty times a day".
 *
 * It also means the message leaves from the company's own number, which is
 * the number the customer recognises and can reply to.
 *
 * The templates are the company's, not ours. The defaults below are a
 * starting point to edit, not a house style — every business words these
 * differently, and one that reads wrong is worse than none.
 */

export type Channel = 'SMS' | 'WHATSAPP';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: Channel | 'BOTH';
  body: string;
}

/**
 * The placeholders a template may use.
 *
 * Arabic names, because the person writing the template is writing Arabic
 * and should not have to remember `{orderNumber}`.
 */
export const TEMPLATE_VARS = [
  { key: 'رقم_الطلب', label: 'رقم الطلب' },
  { key: 'اسم_الزبون', label: 'اسم الزبون' },
  { key: 'المبلغ', label: 'المبلغ المطلوب' },
  { key: 'العملة', label: 'العملة' },
  { key: 'شركة_الشحن', label: 'شركة الشحن' },
  { key: 'الباركود', label: 'رقم التتبع' },
  { key: 'المحافظة', label: 'المحافظة' },
  { key: 'المتجر', label: 'اسم المتجر' },
] as const;

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'out-for-delivery',
    name: 'خرج للتوصيل',
    channel: 'BOTH',
    body: 'مرحبا {اسم_الزبون}، طلبك {رقم_الطلب} خرج للتوصيل اليوم مع {شركة_الشحن}. المبلغ المطلوب {المبلغ} {العملة}. رجاءً كن متاحاً على هذا الرقم.',
  },
  {
    id: 'no-answer',
    name: 'حاولنا ولم نصل',
    channel: 'BOTH',
    body: 'مرحبا {اسم_الزبون}، حاول مندوب {شركة_الشحن} الوصول إليك لتسليم طلبك {رقم_الطلب} ولم يوفَّق. رجاءً تواصل معنا لتحديد موعد جديد.',
  },
  {
    id: 'confirm-address',
    name: 'تأكيد العنوان',
    channel: 'WHATSAPP',
    body: 'مرحبا {اسم_الزبون}، قبل شحن طلبك {رقم_الطلب} نريد تأكيد العنوان في {المحافظة}. هل هو صحيح؟',
  },
  {
    id: 'tracking',
    name: 'رقم التتبع',
    channel: 'BOTH',
    body: 'طلبك {رقم_الطلب} مع {شركة_الشحن}، ورقم التتبع {الباركود}. المبلغ {المبلغ} {العملة}.',
  },
];

export interface FillContext {
  orderNumber?: string | null;
  customerName?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  courier?: string | null;
  barcode?: string | null;
  region?: string | null;
  storeName?: string | null;
}

/**
 * Put the order's own words into the template.
 *
 * A placeholder with nothing behind it becomes an empty string rather than
 * the literal `{الباركود}`: a customer reading a brace knows something in
 * our system is broken, and there is no repair they can make.
 */
export function fillTemplate(body: string, ctx: FillContext): string {
  const values: Record<string, string> = {
    رقم_الطلب: ctx.orderNumber ?? '',
    اسم_الزبون: ctx.customerName ?? '',
    المبلغ: ctx.amount == null ? '' : String(ctx.amount),
    العملة: ctx.currency ?? '',
    شركة_الشحن: ctx.courier ?? '',
    الباركود: ctx.barcode ?? '',
    المحافظة: ctx.region ?? '',
    المتجر: ctx.storeName ?? '',
  };
  return body
    .replace(/\{([^}]+)\}/g, (whole, name: string) => {
      const key = name.trim();
      return key in values ? values[key] : whole;
    })
    // A missing value can leave a double space or a stranded comma.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** wa.me wants digits only, with the country code and no leading zero. */
export function waNumber(raw: string, countryCode?: string | null): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (countryCode) {
    const cc = countryCode.replace(/\D/g, '');
    if (cc && !digits.startsWith(cc)) {
      digits = cc + digits.replace(/^0+/, '');
    }
  }
  return digits;
}

export async function templatesFor(companyId: string): Promise<MessageTemplate[]> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  try {
    const stored = (company?.settings ? JSON.parse(company.settings) : {}).messageTemplates;
    if (Array.isArray(stored) && stored.length > 0) return stored as MessageTemplate[];
  } catch {
    /* a broken settings blob must not take the tracking screen down */
  }
  return DEFAULT_TEMPLATES;
}

export async function saveTemplates(
  companyId: string,
  templates: MessageTemplate[]
): Promise<MessageTemplate[]> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  const all = (() => {
    try {
      return company?.settings ? JSON.parse(company.settings) : {};
    } catch {
      return {};
    }
  })();
  await db.company.update({
    where: { id: companyId },
    data: { settings: JSON.stringify({ ...all, messageTemplates: templates }) },
  });
  return templates;
}
