/**
 * «ليش تطلب عنّا» — FOUR ROWS, AND EVERY ONE OF THEM TRUE BY CONSTRUCTION.
 *
 * The owner's §٣ for «علامة»: an icon, a title and a line, under the
 * series. What it must not become is the invented trust row every
 * storefront template ships with — «١٠٠٪ أصلي», «ضمان استرجاع», «أسرع
 * توصيل» — none of which this system can check.
 *
 * So each row here is either a fact about how this product works or a
 * setting the seller turned on:
 *
 *   الدفع عند الاستلام   — every order in this system is COD.
 *   توصيل لكل المحافظات  — the shop's own reach, as the header says it.
 *   رح نتصل فيك قبل الشحن — the confirmation step exists in the OMS.
 *   تغليف خفي            — §٩: a SETTING. Off, and the row is absent.
 *
 * It reuses `lp-trust`, the block library's own trust row, rather than
 * styling four boxes again — the same shape, the same spacing, no new
 * bytes in a stylesheet a shopper waits for.
 *
 * ⚠️ AND IT DRAWS NO ICON, which the owner's §٣ asks for. The shop's own
 * icon file (`./icons`) carries exactly six drawings and says why: a
 * named import from the icon PACKAGE shipped 245 of them to a shopper,
 * measured, so each one here is a path copied in on purpose. The two this
 * row would want — a truck and a shield — are a deliberate addition to
 * that file rather than a line in this one, and the row reads correctly
 * without them. Recorded in `docs/storefront/FAMILIES.md`.
 */
export function BrandWhy({ discreetPacking }: { discreetPacking: boolean }) {
  return (
    <section className="lp-section" aria-labelledby="sf-why">
      <h2 className="lp-h2" id="sf-why">
        ليش تطلب عنّا
      </h2>
      <div className="lp-trust">
        <div>
          <strong>الدفع عند الاستلام</strong>
          <span>تدفع لما يوصلك، بلا بطاقة</span>
        </div>
        <div>
          <strong>توصيل لكل المحافظات</strong>
          <span>لباب البيت</span>
        </div>
        <div>
          <strong>منتصل فيك قبل الشحن</strong>
          <span>نأكّد الطلب والعنوان</span>
        </div>
        {/* §٩: off by default, and absent when off — never a claim the
            template makes on the seller's behalf. */}
        {discreetPacking && (
          <div>
              <strong>تغليف خفي</strong>
            <span>بلا اسم ولا وصف عالكرتونة</span>
          </div>
        )}
      </div>
    </section>
  );
}
