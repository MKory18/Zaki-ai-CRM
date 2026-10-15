import { db } from '@/lib/db';
import { activeBlock } from '@/lib/blacklist';
import { normalizePhoneNumber } from '@/lib/phone';
import { realStoresOnly } from '@/lib/test-store';
import { requireSystemToken } from '@/lib/v1/system-token';
import { V1_CODE, V1Fault, v1ErrorResponse, v1Ok, requestIdOf } from '@/lib/v1/door';
import { amountString } from '@/lib/v1/shape';

/**
 * GET /api/v1/customers/lookup?phone=… — «do we know this number?»
 *
 * ── WHAT COMES BACK, AND WHAT CANNOT ──
 *
 * «تطبيع الرقم بنفس `normalizePhoneNumber` · `blacklisted` من `activeBlock`
 * · **بلا اسم ولا عنوان بالرد** (الردود ما بتحتاجهم).»
 *
 * That last clause is the reason this endpoint exists in this shape rather
 * than as a customer read. The replies system is already talking to the
 * person: it has their name, because they typed it. What it cannot know is
 * whether this is their fourth order or their first, and whether somebody
 * here has blocked them — two facts that change the conversation and neither
 * of which is a contact detail.
 *
 * So no name, no address, no alternate number, no notes, no order list. The
 * caller learns a count, a value and a yes/no. A webhook pointed at the
 * wrong host leaks nothing a customer would mind.
 *
 * AND THE ANSWER IS THE SAME WHETHER THE NUMBER IS BLOCKED OR NOT —
 * `exists`, `orders_count` and `total_value` are reported either way. This
 * is not a public page: the caller is a system the seller authorised, and
 * `blacklisted: true` is precisely the fact it needs in order to stop
 * promising a delivery. The neutral refusal `createPublicOrder` gives a
 * STRANGER is for a stranger.
 */

export async function GET(req: Request) {
  const requestId = requestIdOf(req);
  try {
    const caller = await requireSystemToken(req, 'customers.lookup');

    const raw = (new URL(req.url).searchParams.get('phone') ?? '').trim();
    if (!raw || raw.length > 20) {
      throw new V1Fault(422, V1_CODE.VALIDATION_FAILED, 'phone is required', { field: 'phone' });
    }

    // The same normaliser every other door identifies a customer with. A
    // second spelling of «the same number» here would make this endpoint
    // disagree with the order door about whether a person is known.
    const phone = normalizePhoneNumber(raw);

    /*
     * ACROSS THE COMPANY'S REAL STORES, NOT ONE OF THEM.
     *
     * A customer row is per STORE by design (`customer-identity.ts`: «the
     * stores are separate businesses»), and this caller has no store — the
     * token is the company's. So the count and the value are the company's
     * view of this number, which is the question being asked: «have we dealt
     * with them before?». A bench's rows are excluded, because a bench's
     * figures enter no calculation.
     */
    const rows = await db.customer.findMany({
      where: { companyId: caller.companyId, phone, ...realStoresOnly() },
      select: { id: true, totalOrders: true, storeId: true },
    });

    // `blacklisted` is read from the one function that answers it, on the
    // RAW number as sent: `activeBlock` canonicalises, and normalising first
    // would drop a leading `+` — the exact way around a block.
    const block = await activeBlock(db, caller.companyId, raw);

    if (rows.length === 0) {
      return v1Ok(requestId, {
        exists: false,
        blacklisted: block !== null,
        orders_count: 0,
        total_value: amountString(0, 2),
      });
    }

    /*
     * THE VALUE IS WHAT WAS DELIVERED, NOT WHAT WAS ORDERED.
     *
     * «total_value» has to mean something a seller would recognise, and the
     * figure that means «this customer is worth having» is money that
     * actually arrived. Summing every order ever typed would count the ones
     * they refused at the door — and a customer who refuses four parcels
     * would read as the shop's best.
     *
     * Delivered orders only, and the ORDER'S OWN currency's places. The
     * aggregate is in `totalAmount`, the order's stored total.
     */
    const delivered = await db.order.aggregate({
      where: {
        companyId: caller.companyId,
        customerId: { in: rows.map((r) => r.id) },
        shippingStatus: 'DELIVERED',
        // A company-wide money read, so the bench is subtracted explicitly —
        // «أرقامٌ لا تدخل أيَّ حسبة». The customer rows above are already
        // filtered the same way, and this says so where the figure is made
        // rather than relying on that.
        ...realStoresOnly(),
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    // The minor unit of the store these rows belong to. One company sells
    // into one currency per country, and a customer's stores are this
    // company's; where they differ the widest is taken, so no fils is cut.
    const countries = await db.store.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.storeId).filter(Boolean) as string[])] } },
      select: { country: { select: { minorUnit: true } } },
    });
    const minorUnit = countries.reduce((widest, s) => Math.max(widest, s.country?.minorUnit ?? 2), 2);

    return v1Ok(requestId, {
      exists: true,
      blacklisted: block !== null,
      // Every order this number has placed, delivered or not — «how many
      // times have they ordered» is a different question from «how much have
      // they paid», and both are useful to the person writing the reply.
      orders_count: rows.reduce((n, r) => n + (r.totalOrders ?? 0), 0),
      delivered_count: delivered._count._all,
      total_value: amountString(Number(delivered._sum.totalAmount ?? 0), minorUnit),
    });
  } catch (error) {
    return v1ErrorResponse(requestId, error);
  }
}
