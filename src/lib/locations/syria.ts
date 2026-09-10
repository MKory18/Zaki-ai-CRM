/**
 * Central Syrian locations data source (single source of truth).
 *
 * Used by: public landing-page order form (searchable select), server-side
 * city validation, CRM order/customer forms (via the re-exported
 * SYRIAN_GOVERNORATES from '@/lib/syria' — kept for backward compatibility).
 *
 * The public order API only accepts values present in this list
 * (governorate OR one of its cities/regions).
 */

export interface SyrianLocation {
  governorate: string;
  cities: string[];
}

export const SYRIAN_LOCATIONS: SyrianLocation[] = [
  { governorate: 'دمشق', cities: ['دمشق', 'المزة', 'كفرسوسة', 'الشام', 'الميدان', 'القدم', 'جوبة', 'البرامكة', 'المالكي', 'شعلان', 'التل', 'يرموك'] },
  { governorate: 'ريف دمشق', cities: ['جرمانا', 'صحنايا', 'قدسيا', 'دوما', 'حرستا', 'عربين', 'قطنا', 'المواضع', 'الحجر الأسود', 'كناكر', 'صبتة', 'خان الشيح', 'يعفور', 'عقدة', 'يرموك الجديدة', 'السبينة', 'يرموك', 'القصوة', 'داريا', 'الكسوة', 'الزبداني', 'المضة', 'بسيمة', 'أرنبه'] },
  { governorate: 'حلب', cities: ['حلب', 'الشيخ نجار', 'السفيرة', 'عين العرب', 'الباب', 'منبج', 'جرابلس', 'أفاميا', 'أعزاز', 'الرياضية', 'تل رفعت', 'نبل والزهراء', 'الشيخ مقصود', 'حريتان', 'صوران', 'الاعتزاز', 'دابق', 'الراعي', 'بيانون', 'الشيخ سعيد', 'الصاخنة', 'الشيخ طه', 'حلب الجديدة', 'الفرقان', 'الشعار', 'عنادان', 'كفر حمرة', 'المير', 'سفوحن', 'الخالصة'] },
  { governorate: 'حمص', cities: ['حمص', 'دبوسة', 'الرستن', 'تلبسة', 'تدمر', 'المخرم', 'مصياف', 'حصن سلطان', 'شين', 'عكيربات', 'الغنطو', 'زيدال', 'مزة'] },
  { governorate: 'حماة', cities: ['حماة', 'السقيلبية', 'معرة النعمان', 'حلفايا', 'مديك', 'كفرنبوحة', 'محردة', 'القابون', 'كفر زيتا', 'اللطامنة', 'كفر طاحا', 'مورك', 'تيماءا', 'حزورة'] },
  { governorate: 'اللاذقية', cities: ['اللاذقية', 'جبلة', 'كرناز', 'القرداحة', 'الحفة', 'عين البيضاء', 'الكستل بلحرم', 'سلطة', 'الشيخ دبوس'] },
  { governorate: 'طرطوس', cities: ['طرطوس', 'بانياس', 'الشدادي', 'الدريكيش', 'المصياف', 'الحميدية', 'القملية', 'سفيتة', 'خربة الملاح', 'مسيا'] },
  { governorate: 'إدلب', cities: ['إدلب', 'أريحا', 'جسر الشغور', 'معرة مصين', 'كفر نبل', 'بنش', 'سرمين', 'سلقين', 'كفريا', 'أبو الظهور', 'حارم', 'كفر تخاريم', 'التقاد', 'إحسم', 'الرام'] },
  { governorate: 'دير الزور', cities: ['دير الزور', 'البوكمال', 'الميادين', 'القورية', 'الحجين', 'جرانيج', 'السوارية', 'العالي'] },
  { governorate: 'الحسكة', cities: ['الحسكة', 'القامشلي', 'راس العين', 'اليعربية', 'تل تمر', 'الشدد', 'الخالدية', 'المالكية', 'عمودة', 'تال تمر', 'الحول'] },
  { governorate: 'الرقة', cities: ['الرقة', 'البالخ', 'الطبقة', 'مننج', 'الحران', 'كارمة'] },
  { governorate: 'درعا', cities: ['درعا', 'بصرى الشام', 'نوى', 'شيخ مسكين', 'الصنمين', 'جاسم', 'طمعة', 'خرباج', 'دلل', 'المسيرة', 'يبلا', 'تبطبة', 'الحراك'] },
  { governorate: 'السويداء', cities: ['السويداء', 'شهبا', 'صلخد', 'سعد', 'الدوما', 'العراق', 'ريمة حزن', 'عجل', 'المشاريع'] },
  { governorate: 'القنيطرة', cities: ['القنيطرة', 'فيق', 'خان أرنبة', 'الرثوية', 'الجديدة', 'حصن'] },
  { governorate: 'أخرى', cities: [] },
];

/** Re-export for backward compatibility with existing CRM imports. */
export const SYRIAN_GOVERNORATES: string[] = SYRIAN_LOCATIONS.map((l) => l.governorate);

/** Flat list of every selectable value (governorates + cities), deduplicated. */
export const ALL_SYRIAN_LOCATIONS: string[] = Array.from(
  new Set(SYRIAN_LOCATIONS.flatMap((l) => [l.governorate, ...l.cities]))
);

/** Server-side validation: the submitted city MUST exist in this list. */
export function isSyrianLocation(value: string): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v === 'أخرى') return true; // matches legacy CRM behavior
  if (SYRIAN_GOVERNORATES.includes(v)) return true;
  return SYRIAN_LOCATIONS.some((l) => l.cities.includes(v));
}