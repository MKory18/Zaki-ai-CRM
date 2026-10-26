import type { DispatchOutcome } from './courier-dispatch';

/**
 * WHY ONE ORDER OF A DISPATCH DID NOT GO, IN WORDS.
 *
 * Two screens send a batch to the courier — the batches screen and the
 * banner after «إنشاء شحنة» — and each needs the same sentence for the same
 * reason. Written once here, so «لا رمز لها عند الشركة» cannot read one way
 * on one screen and another on the other.
 */
export function dispatchReasonAr(o: Pick<DispatchOutcome, 'skipped' | 'regionName' | 'error'>): string {
  switch (o.skipped) {
    case 'ALREADY_SENT':
      return 'له باركود أصلاً';
    case 'NOT_AUTOMATED':
      return 'شركة يدوية — لا API';
    case 'NO_PROVIDER':
      return 'بلا شركة شحن';
    case 'SEND_IN_FLIGHT':
      return 'قيد الإرسال الآن من مكانٍ آخر';
    case 'NO_COURIER_CITY':
      // Which governorate, and where its id goes — it was an English error code.
      return `${o.regionName ?? 'المحافظة'}: لا رمز لها عند الشركة بعد — لم يُرسَل. أدخِل رمزها من شركات الشحن ← الأجور ← «رمزها عند الشركة»، أو انقل الطلب لشركة أخرى`;
    default:
      return o.error ?? '';
  }
}
