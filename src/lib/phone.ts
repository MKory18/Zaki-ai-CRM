/**
 * Normalizes phone numbers by stripping whitespace, dashes, plus signs, brackets,
 * and normalizing common country prefixes (e.g. Egypt +20, 0020, 010 -> 010).
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');

  // Strip international Egypt prefix 20 or 0020 if leading
  if (digits.startsWith('0020')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('20') && digits.length > 10) {
    digits = digits.slice(2);
  }

  // Ensure leading 0 for Egyptian standard mobile if 10 digits starting with 1
  if (digits.length === 10 && (digits.startsWith('10') || digits.startsWith('11') || digits.startsWith('12') || digits.startsWith('15'))) {
    digits = '0' + digits;
  }

  return digits;
}

export function formatPhoneNumber(phone: string): string {
  const norm = normalizePhoneNumber(phone);
  if (norm.length === 11 && norm.startsWith('01')) {
    // Format Egyptian mobile: 010 1234 5678
    return `${norm.slice(0, 3)} ${norm.slice(3, 7)} ${norm.slice(7)}`;
  }
  return phone;
}
