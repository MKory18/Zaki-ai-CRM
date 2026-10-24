/**
 * محافظ متجر «صحة بلس» (سوريا) كما سمّاها المالك — اسم وعملة لكل محفظة، ورصيد افتتاحي صفر.
 *
 * «ع الجديد شيل صفرين» = الليرة السورية الجديدة؛ رمزها بالنظام SYP (الاسم هو الذي يفرّقها عن القديمة).
 * الرصيد الافتتاحي صفر: الرقم الحقيقي يدخله صاحب الصندوق بخطوة «العدّ الافتتاحي» بالشاشة، لا نخمّنه هنا.
 */
export interface WalletSpec {
  name: string;
  currencyCode: string;
}

/** The same two spellings of the store apply-sehha accepts: exactly one store may match. */
export { STORE_NAMES } from '../sehha/catalog';

export const WALLETS: WalletSpec[] = [
  { name: 'كاش ليرة سوري', currencyCode: 'SYP' },
  { name: 'كاش دولار', currencyCode: 'USD' },
  { name: 'شام كاش سوري', currencyCode: 'SYP' },
  { name: 'شام كاش دولار', currencyCode: 'USD' },
  { name: 'محفظة binance', currencyCode: 'USDT' },
];
