/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits as ASCII — how an Arabic
 * keyboard types a number, read the way every validator and parser expects.
 * Nothing else in the string changes.
 */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x30));
}
