'use client';

import { LAYOUT_SLOTS, type LayoutSlot } from '@/lib/layout-slots';
import { DEFAULT_LAYOUT, type StoreTheme } from '@/lib/store-theme';

/**
 * SWITCHING THE ARRANGEMENT, WITHOUT LEAVING THE TEMPLATE.
 *
 * «التبديل بين نسخ الترويسة والبطل والتنقّل والبطاقة وصفحة المنتج».
 *
 * The engine has drawn these since the slots were written and the theme
 * route has accepted them since the schema was extended — and no screen
 * offered one, so a seller could reach them only by installing a template
 * that happened to carry the arrangement they wanted. That is a seller
 * choosing a whole look to get one row of chips.
 *
 * WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS.
 *
 * There is no «بلا ترويسة», no «بلا بحث», no «بلا سلة». «النواة المقفولة
 * ما بتنشال»: the search, the basket and the WhatsApp button are rendered
 * unconditionally by the shell and the stylesheet only decides WHERE. A
 * variant is an arrangement, never a subtraction — so this panel cannot
 * offer a value that removes one, because no such value exists.
 *
 * The names a seller reads are the names of what they get, not the keys
 * the engine stores. A seller does not pick `searchFirst`.
 */

const SLOT_LABEL: Record<LayoutSlot, { title: string; hint: string }> = {
  header: { title: 'الترويسة', hint: 'البحث والسلة وزر واتساب موجودة في كل نسخة — ما يتغيّر هو ترتيبها' },
  hero: { title: 'أول الشاشة', hint: 'ما تفتح به الصفحة الرئيسية — منتجات أو عروض أو فئات، لا اسم المتجر وحده' },
  categoryNav: { title: 'تنقّل الفئات', hint: 'كيف يصل المشتري من فئة إلى أخرى' },
  productCard: { title: 'بطاقة المنتج', hint: 'شكل البطاقة في الرفّ' },
  categoryPage: { title: 'صفحة الفئة', hint: 'كثافة الشبكة داخل الفئة' },
  productPage: { title: 'صفحة المنتج', hint: 'مكان الصور من التفاصيل' },
  cart: { title: 'السلة', hint: 'تفتح كدرج جانبي أو كصفحة' },
};

const VARIANT_LABEL: Record<string, string> = {
  // header
  minimal: 'بسيطة',
  searchFirst: 'البحث أولاً',
  split: 'مفرودة',
  stacked: 'صفّان',
  transparent: 'شفافة',
  // hero
  productFirst: 'منتجات',
  offerStrip: 'شريط عروض',
  categoryTiles: 'مربّعات فئات',
  editorial: 'عنوان وجملة',
  slider: 'شرائح',
  // categoryNav
  chips: 'أزرار',
  tiles: 'مربّعات',
  sidebar: 'عمود جانبي',
  dropdown: 'قائمة منسدلة',
  // productCard
  portrait: 'طولية',
  square: 'مربّعة',
  wide: 'عريضة',
  compact: 'مضغوطة',
  // categoryPage
  grid2: 'عمودان',
  grid3: 'ثلاثة أعمدة',
  list: 'قائمة',
  mixed: 'مختلطة',
  // productPage
  gallerySide: 'الصور بالجانب',
  galleryTop: 'الصور بالأعلى',
  sticky: 'الطلب ملتصق',
  // cart
  drawer: 'درج جانبي',
  page: 'صفحة',
};

export function LayoutPanel({
  layout,
  onChange,
  /** A shop with no cart has no cart slot — absent, not disabled. */
  cartApplies,
}: {
  layout: StoreTheme['layout'];
  onChange: (slot: LayoutSlot, variant: string) => void;
  cartApplies: boolean;
}) {
  const current = { ...DEFAULT_LAYOUT, ...(layout ?? {}) };
  const slots = (Object.keys(LAYOUT_SLOTS) as LayoutSlot[]).filter(
    (s) => s !== 'cart' || cartApplies
  );

  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <div key={slot}>
          <p className="text-sm font-bold text-[var(--sys-heading)]">{SLOT_LABEL[slot].title}</p>
          <p className="mb-2 mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            {SLOT_LABEL[slot].hint}
          </p>
          <div role="group" aria-label={SLOT_LABEL[slot].title} className="flex flex-wrap gap-1.5">
            {LAYOUT_SLOTS[slot].map((variant) => {
              const on = current[slot] === variant;
              return (
                <button
                  key={variant}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(slot, variant)}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    on
                      ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                      : 'border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-primary)]'
                  }`}
                >
                  {VARIANT_LABEL[variant] ?? variant}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
