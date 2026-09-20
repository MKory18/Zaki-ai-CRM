/**
 * Phone validation per country.
 *
 * A store in Jordan must not be made to accept Syrian numbers, and the
 * reverse. The rule is chosen by the country's ISO code, which every Country
 * row carries; a country we have no rule for falls back to a permissive
 * length check rather than rejecting a real customer.
 *
 * Normalization is the same everywhere: drop every non-digit, drop the
 * international prefix (00<dial> / <dial>), drop one leading zero. What is
 * left is the national subscriber number that `national` must match.
 */

export interface PhoneRule {
  /** Country calling code, digits only. */
  dialCode: string;
  /** The national number, WITHOUT its leading zero. */
  national: RegExp;
  /** Country name in Arabic, for the error the visitor reads. */
  countryName: string;
  /** Shown as the field placeholder. */
  example: string;
}

export const PHONE_RULES: Record<string, PhoneRule> = {
  // Mobile 9XXXXXXXX, landlines 11/21/31/33/41/43/51/52/53 + subscriber.
  SY: {
    dialCode: '963',
    national: /^(?:9\d{8}|(?:11|21|31|33|41|43|51|52|53)\d{6,7})$/,
    countryName: 'سوري',
    example: '09XXXXXXXX',
  },
  // Mobile 7[7-9]XXXXXXX, landlines 2/3/5/6 + 7 digits.
  JO: {
    dialCode: '962',
    national: /^(?:7[7-9]\d{7}|[23568]\d{7})$/,
    countryName: 'أردني',
    example: '07XXXXXXXX',
  },
  SA: {
    dialCode: '966',
    national: /^(?:5\d{8}|1\d{7,8})$/,
    countryName: 'سعودي',
    example: '05XXXXXXXX',
  },
  AE: {
    dialCode: '971',
    national: /^(?:5[024568]\d{7}|[234679]\d{7})$/,
    countryName: 'إماراتي',
    example: '05XXXXXXXX',
  },
  EG: {
    dialCode: '20',
    national: /^(?:1[0125]\d{8}|[23]\d{7,8}|\d{2}\d{6,7})$/,
    countryName: 'مصري',
    example: '01XXXXXXXXX',
  },
  IQ: {
    dialCode: '964',
    national: /^(?:7[3-9]\d{8}|[1-6]\d{7,8})$/,
    countryName: 'عراقي',
    example: '07XXXXXXXXX',
  },
};

/** Strip formatting, the international prefix and one leading zero. */
export function nationalDigits(raw: string, dialCode?: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (dialCode) {
    if (digits.startsWith(`00${dialCode}`)) digits = digits.slice(2 + dialCode.length);
    else if (digits.startsWith(dialCode) && digits.length > dialCode.length + 6) {
      digits = digits.slice(dialCode.length);
    }
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function ruleFor(countryCode: string | null | undefined): PhoneRule | null {
  if (!countryCode) return null;
  return PHONE_RULES[countryCode.trim().toUpperCase()] ?? null;
}

/**
 * True when `raw` is a valid number for that country. With no rule for the
 * country (including the "ZZ" placeholder), any 7–15 digit number passes:
 * refusing every order of a country we simply have no table for would be
 * worse than accepting a loose number a human then calls.
 */
export function isValidPhoneFor(countryCode: string | null | undefined, raw: string): boolean {
  if (!raw || !/^[+0-9()\s-]+$/.test(raw)) return false;
  const rule = ruleFor(countryCode);
  const digits = nationalDigits(raw, rule?.dialCode);
  if (!rule) return digits.length >= 7 && digits.length <= 15;
  return rule.national.test(digits);
}

/** The message the visitor sees when their number does not fit. */
export function phoneErrorFor(countryCode: string | null | undefined): string {
  const rule = ruleFor(countryCode);
  return rule
    ? `يرجى إدخال رقم هاتف ${rule.countryName} صحيح.`
    : 'يرجى إدخال رقم هاتف صحيح.';
}
