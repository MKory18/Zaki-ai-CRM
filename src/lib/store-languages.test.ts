import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  STORE_LANGUAGES,
  directionOf,
  languageOf,
  storeLanguageSchema,
} from './store-languages';

/**
 * A SHOP READS THE WAY ITS LANGUAGE READS.
 *
 * The direction is derived and never stored: a pair of fields that can
 * disagree eventually will, and «العربية · LTR» is not a thing anybody meant
 * to save.
 */

describe('the direction follows the language', () => {
  it.each([['ar', 'rtl'], ['fa', 'rtl'], ['ur', 'rtl'], ['en', 'ltr'], ['fr', 'ltr'], ['tr', 'ltr']])(
    '%s reads %s',
    (code, dir) => {
      expect(directionOf(code)).toBe(dir);
    }
  );

  it('cannot be set to disagree, because there is nowhere to set it', () => {
    // What a request may carry is a language code and nothing else. A
    // direction sent alongside is not accepted — it would be the second
    // source of truth this avoids.
    expect(typeof storeLanguageSchema.parse('ar')).toBe('string');
    expect(storeLanguageSchema.safeParse({ language: 'ar', dir: 'ltr' }).success).toBe(false);
    expect(storeLanguageSchema.safeParse('ltr').success).toBe(false);
  });

  it('so the same language always reads the same way, however it was reached', () => {
    for (const l of STORE_LANGUAGES) {
      expect(directionOf(l.code), l.code).toBe(l.dir);
      expect(directionOf(languageOf(l.code).code), l.code).toBe(l.dir);
    }
  });
});

describe('a value this build does not know', () => {
  it.each([[null], [undefined], [''], ['zz'], ['de'], ['ar-SY']])(
    '%s falls back to Arabic and right-to-left',
    (code) => {
      // Every shop on this system was rtl before there was a choice. An
      // unknown value must not silently mirror a working shop.
      expect(directionOf(code as string)).toBe('rtl');
      expect(languageOf(code as string).code).toBe(DEFAULT_LANGUAGE);
    }
  );

  it('is refused when it comes from a request, rather than quietly defaulted', () => {
    // A fallback is right for reading an old row; it is wrong for accepting
    // a value somebody just typed.
    for (const bad of ['zz', 'de', 'ar-SY', '', 'rtl']) {
      expect(storeLanguageSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('the list itself', () => {
  it('has no duplicate codes', () => {
    const codes = STORE_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('starts with Arabic, which is what every shop already was', () => {
    expect(STORE_LANGUAGES[0].code).toBe(DEFAULT_LANGUAGE);
    expect(DEFAULT_LANGUAGE).toBe('ar');
  });

  it('gives every language a label a seller can recognise and a real direction', () => {
    for (const l of STORE_LANGUAGES) {
      expect(l.label.trim().length, l.code).toBeGreaterThan(1);
      expect(['rtl', 'ltr'], l.code).toContain(l.dir);
    }
  });

  it('offers no language it has not decided a direction for', () => {
    expect(STORE_LANGUAGES.every((l) => l.dir === 'rtl' || l.dir === 'ltr')).toBe(true);
  });
});
