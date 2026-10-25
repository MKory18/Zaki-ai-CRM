/**
 * Phone validation per country.
 *
 * A store in Jordan must not be made to accept Syrian numbers, and the
 * reverse. The rule is chosen by the country's ISO code, which every Country
 * row carries; a country we have no rule for falls back to a permissive
 * length check rather than rejecting a real customer.
 *
 * Normalization is the same everywhere: ARABIC-INDIC DIGITS TO LATIN, then
 * drop every non-digit, drop the international prefix (00<dial> / <dial>),
 * drop one leading zero. What is left is the national subscriber number that
 * `national` must match.
 *
 * THE SCRIPT STEP IS NOT COSMETIC, AND IT WAS MISSING. Every strip in this
 * file is `/\D/`, and `\D` in JavaScript is `[^0-9]` — not «not a digit», but
 * «not an ASCII digit», and no flag changes that: `/\D/u` and `/\D/v` behave
 * the same. So a number typed on an Arabic keypad was not partly mangled, it
 * was DELETED. Measured:
 *
 *     '٠٩٩١٢٣٤٥٦٧'.replace(/\D/g, '')   →   ''
 *     '+٩٦٣ ٩٦٦ 793918'.replace(/\D/g, '') → '793918'   (the Latin tail only)
 *
 * On an Arabic-facing storefront that is a customer's phone number, and it
 * reached three different wrong places at once:
 *
 *   · `canonicalPhone` returned `''`, so `normalizePhoneNumber` stored a
 *     customer with NO PHONE on a cash-on-delivery system;
 *   · `activeBlock` does `if (!phone) return null` — SO THE BLACKLIST WAS
 *     SKIPPED. This file's own comment below says «a block that can be
 *     walked around by writing the number differently is not a block», and
 *     writing it on an Arabic keypad walked around it;
 *   · `isValidPhoneFor` refused the shape outright, so the honest outcome
 *     on the one path that checked was a real customer told their real
 *     number does not fit.
 *
 * `toLatinDigits` is the one named place that does this conversion, the same
 * one `readTypedFigure` uses, and it maps a digit to a digit and touches
 * nothing else. A phone number carries no decimal point and no thousands
 * separator, so there is none of the ambiguity that makes a comma unreadable
 * in a money cell: `٠٧٩` is `079` and there is no second reading of it.
 * `western-digits.test.ts` already carried a test called «the phone
 * normaliser still recognises what an Arabic keyboard types» — it asserted
 * that on `toLatinDigits` itself, which was true, while the phone normaliser
 * did not call it.
 */
import { toLatinDigits } from './latin-digits';

export interface PhoneRule {
  /** Country calling code, digits only. */
  dialCode: string;
  /** The national number, WITHOUT its leading zero. */
  national: RegExp;
  /** Country name in Arabic, for the error the visitor reads. */
  countryName: string;
  /** Shown as the field placeholder. */
  example: string;
  /**
   * A REAL number of this shape — one the rule above accepts — for a sample row to carry.
   *
   * `example` is a placeholder («07XXXXXXXX») and says what a number looks like; a spreadsheet's sample row needs one that
   * passes. The model file used to carry a Syrian number whatever the store, which is a number the rule of a Jordanian store
   * refuses — so the template's own example came back «فيه نقص».
   */
  sample: string;
  /**
   * Also accept a FOREIGN number — «زبون بالشمال السوري بخط تركي… لازم يقبل»، «هاي ارقام دول ثانية عادي».
   *
   * The north of Syria runs on Turkish lines, and customers abroad order for family at home, so a Syrian store
   * refusing every number that is not Syrian refuses real customers. See `isForeignNumber` for the shape.
   */
  acceptsForeign?: boolean;
}

export const PHONE_RULES: Record<string, PhoneRule> = {
  // Mobile 9XXXXXXXX, landlines 11/21/31/33/41/43/51/52/53 + subscriber — and a foreign number beside them.
  SY: {
    dialCode: '963',
    national: /^(?:9\d{8}|(?:11|21|31|33|41|43|51|52|53)\d{6,7})$/,
    countryName: 'سوري',
    example: '09XXXXXXXX',
    sample: '0991234567',
    acceptsForeign: true,
  },
  // Mobile 7[7-9]XXXXXXX, landlines 2/3/5/6 + 7 digits.
  JO: {
    dialCode: '962',
    national: /^(?:7[7-9]\d{7}|[23568]\d{7})$/,
    countryName: 'أردني',
    example: '07XXXXXXXX',
    sample: '0791234567',
  },
  SA: {
    dialCode: '966',
    national: /^(?:5\d{8}|1\d{7,8})$/,
    countryName: 'سعودي',
    example: '05XXXXXXXX',
    sample: '0512345678',
  },
  AE: {
    dialCode: '971',
    national: /^(?:5[024568]\d{7}|[234679]\d{7})$/,
    countryName: 'إماراتي',
    example: '05XXXXXXXX',
    sample: '0501234567',
  },
  EG: {
    dialCode: '20',
    national: /^(?:1[0125]\d{8}|[23]\d{7,8}|\d{2}\d{6,7})$/,
    countryName: 'مصري',
    example: '01XXXXXXXXX',
    sample: '01012345678',
  },
  IQ: {
    dialCode: '964',
    national: /^(?:7[3-9]\d{8}|[1-6]\d{7,8})$/,
    countryName: 'عراقي',
    example: '07XXXXXXXXX',
    sample: '07712345678',
  },
};

/**
 * Strip formatting, the international prefix and one leading zero.
 *
 * `toLatinDigits` FIRST, because `\D` below is `[^0-9]` and would otherwise
 * delete an Arabic-typed number rather than normalise it.
 */
export function nationalDigits(raw: string, dialCode?: string): string {
  let digits = toLatinDigits(raw || '').replace(/\D/g, '');
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
 * A number a sample row can carry for this country: the rule's own `sample`, and for a country with no rule a nine-digit number,
 * which the permissive 7–15 digit check accepts.
 */
export function samplePhoneFor(countryCode: string | null | undefined): string {
  return ruleFor(countryCode)?.sample ?? '0123456789';
}

/**
 * True when `raw` is a valid number for that country. With no rule for the
 * country (including the "ZZ" placeholder), any 7–15 digit number passes:
 * refusing every order of a country we simply have no table for would be
 * worse than accepting a loose number a human then calls.
 */
export function isValidPhoneFor(countryCode: string | null | undefined, raw: string): boolean {
  // The shape is checked AFTER the script conversion, not before it: the
  // class `[0-9]` refused «٠٧٩٠١٢٣٤٥٦» outright, so a visitor typing on the
  // keyboard this storefront is written for was told their number is wrong.
  const text = toLatinDigits(raw ?? '');
  if (!text || !/^[+0-9()\s-]+$/.test(text)) return false;
  const rule = ruleFor(countryCode);
  const digits = nationalDigits(text, rule?.dialCode);
  if (!rule) return digits.length >= 7 && digits.length <= 15;
  return rule.national.test(digits) || (!!rule.acceptsForeign && isForeignNumber(text, rule));
}

/**
 * A number that is not this country's but is a whole number of ANOTHER country — for a rule that `acceptsForeign`.
 *
 * Ten to fifteen digits (E.164 stops at fifteen) once a leading `+`/`00` and the trunk zeros are gone, not opening
 * with this country's own dial code (that is a national number, judged by `national` alone), and not a national
 * mobile with one digit too many — «09912345678» is a Syrian typo, not a foreign line. So «+90 5XX XXX XX XX»,
 * «905XXXXXXXXX» and a ten-digit Turkish «5XXXXXXXXX» pass; an eight-digit stub does not.
 */
export function isForeignNumber(raw: string, rule: PhoneRule): boolean {
  if (rule.national.test(nationalDigits(raw, rule.dialCode))) return false;
  const digits = toLatinDigits(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 10 || digits.length > 15) return false;
  if (digits.startsWith(rule.dialCode)) return false;
  const mobileHead = rule.sample.replace(/^0/, '')[0];
  if (digits.length <= rule.sample.length && digits.startsWith(mobileHead)) return false;
  return true;
}

/** The message the visitor sees when their number does not fit. */
export function phoneErrorFor(countryCode: string | null | undefined): string {
  const rule = ruleFor(countryCode);
  if (rule?.acceptsForeign) return `يرجى إدخال رقم هاتف ${rule.countryName} صحيح، أو رقم دولي كامل برمز بلده.`;
  return rule
    ? `يرجى إدخال رقم هاتف ${rule.countryName} صحيح.`
    : 'يرجى إدخال رقم هاتف صحيح.';
}

/** Every dial code we know, longest first so 963 is tried before 96. */
const DIAL_CODES = [...new Set(Object.values(PHONE_RULES).map((r) => r.dialCode))].sort(
  (a, b) => b.length - a.length
);

/**
 * One phone, one string — whatever form it was written in.
 *
 * "+963 966 793918" and "0966793918" are the same person, and anything that
 * identifies a person by their number has to agree on that. The blacklist
 * is the sharp case: a block that can be walked around by writing the number
 * differently is not a block.
 *
 * A dial code is only stripped when the number was written internationally
 * (a leading + or 00). Otherwise a local Syrian 0966… would be mistaken for
 * a Saudi +966… — so the explicit marker is what licenses the strip, and a
 * plain local number just loses its trunk zero.
 */
export function canonicalPhone(raw: string | null | undefined): string {
  // The script conversion comes first, so «٠٩٩١٢٣٤٥٦٧» is a number and not
  // the empty string — which is what `/\D/` made of it, and what then made
  // `activeBlock` skip the blacklist for anyone who typed in Arabic.
  const text = toLatinDigits(String(raw ?? '')).trim();
  if (!text) return '';

  const digits = text.replace(/\D/g, '');
  if (!digits) return '';

  const international = text.startsWith('+') || digits.startsWith('00');
  let rest = digits.startsWith('00') ? digits.slice(2) : digits;

  if (international) {
    for (const code of DIAL_CODES) {
      if (rest.startsWith(code) && rest.length - code.length >= 6) {
        rest = rest.slice(code.length);
        break;
      }
    }
  }

  // The trunk zero is a dialing convention, not part of the number.
  return rest.replace(/^0+/, '');
}
