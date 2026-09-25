import { z } from 'zod';

/**
 * WHAT LANGUAGE A SHOP SPEAKS, AND WHICH WAY IT READS.
 *
 * Every public page has carried `dir="rtl"` and `lang="ar"` written into the
 * markup since there was only ever one kind of shop. A seller selling in
 * English or French got their page mirrored: the heading on the wrong side,
 * the price on the wrong side, the arrow pointing the wrong way. That is
 * what this fixes, and it is the whole of what it fixes.
 *
 * WHAT THIS IS NOT.
 *
 * It is not translation. A second language on the list would have to carry a
 * second copy of every product name, every block's words, every static page
 * and every message — a translation store keyed on language, an editor for
 * it beside each field, and a rule for what a page does when a translation
 * is missing. None of that exists, and a screen that let a seller add
 * "English" while the shop kept answering in Arabic would be a promise the
 * system does not keep. So the screen offers ONE language, says plainly what
 * additional ones would need, and does not pretend.
 *
 * Direction is DERIVED from the language, never stored beside it: a pair of
 * fields that can disagree will, and «العربية · LTR» is not a thing anybody
 * meant to save.
 */

export interface StoreLanguage {
  code: string;
  /** What a seller reading the picker calls it. */
  label: string;
  dir: 'rtl' | 'ltr';
}

/**
 * The languages a shop may be set to.
 *
 * Deliberately short: each one here is a direction and a locale the number
 * and date formatting already understands. A longer list would be a longer
 * list of things claimed and not checked.
 */
export const STORE_LANGUAGES: StoreLanguage[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'tr', label: 'Türkçe', dir: 'ltr' },
  { code: 'fa', label: 'فارسی', dir: 'rtl' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
];

export const DEFAULT_LANGUAGE = 'ar';

export const storeLanguageSchema = z.enum(
  STORE_LANGUAGES.map((l) => l.code) as [string, ...string[]]
);

/** The language a shop is set to, or Arabic. */
export function languageOf(code: string | null | undefined): StoreLanguage {
  return STORE_LANGUAGES.find((l) => l.code === code) ?? STORE_LANGUAGES[0];
}

/**
 * Which way a shop's pages read.
 *
 * Derived, so it cannot disagree with the language. A code this build does
 * not know reads right-to-left, because that is what every shop on this
 * system was before there was a choice — an unknown value must not silently
 * mirror a working shop.
 */
export function directionOf(code: string | null | undefined): 'rtl' | 'ltr' {
  return languageOf(code).dir;
}
