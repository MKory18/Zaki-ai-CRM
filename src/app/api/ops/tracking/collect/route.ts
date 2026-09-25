import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { recordMovement } from '@/lib/wallets';
import { markPayableForOrders } from '@/lib/commission';
import { roundMinor } from '@/lib/money';
import { zodMessage } from '@/lib/zod-message';
import { expectedAmountFor } from '@/lib/settlement';

/**
 * POST /api/ops/tracking/collect — settle by hand.
 *
 * A مندوب hands the money over in person and a company without an API sends
 * no file, so for both there is no statement to import and no barcode to
 * match on. Settlement for them is a person saying "I took the money from
 * him", against named orders, into a named wallet.
 *
 * It is the same gate as a statement approval, not a shortcut around it:
 * the wallet movement is written here and nowhere earlier, commission
 * becomes payable only now, and the amount is the NET — what the courier
 * actually hands over, after their fee. Orders already settled are refused
 * rather than counted twice.
 */

const schema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
  walletId: z.string().uuid(),
  /** What was actually handed over. Defaults to the expected net. */
  amount: z.number().positive().max(100_000_000).optional(),
  note: z.string().trim().min(3, 'الملاحظة إلزامية').max(300),
});

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('finance.cashbox');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const wallet = await db.wallet.findFirst({
      where: { id: parsed.data.walletId, companyId, isActive: true },
      select: { id: true, name: true, currencyCode: true },
    });
    if (!wallet) return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 });

    const orders = await db.order.findMany({
      where: { id: { in: parsed.data.orderIds }, companyId, storeId },
      select: {
        id: true, orderNumber: true, currency: true, shippingStatus: true, settlementStatus: true,
        totalAmount: true, deliveryFee: true, collectedAmount: true,
        deliveryProvider: { select: { id: true, name: true, kind: true } },
      },
    });
    if (orders.length === 0) return NextResponse.json({ error: 'لا توجد طلبات' }, { status: 404 });

    const alreadySettled = orders.filter((o) => o.settlementStatus === 'SETTLED');
    if (alreadySettled.length > 0) {
      return NextResponse.json(
        {
          error: `طلبات مسوّاة مسبقاً: ${alreadySettled.map((o) => o.orderNumber).join('، ')}`,
          code: 'ALREADY_SETTLED',
        },
        { status: 409 }
      );
    }

    // Only a delivered parcel owes anything. A returned one owes nothing, and
    // one still in transit has not been collected yet.
    //
    // A PARTIAL delivery owes too, and this refused it. The customer took
    // some lines and paid for them at the door — `collectedAmount` holds the
    // exact figure, and the agent-custody report already counts it among
    // what the courier is holding. But the money could never be recorded as
    // arrived: the one endpoint that takes cash in refused the order, so it
    // sat in the courier's owing list for ever with no way to clear it.
    const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'];
    const notDelivered = orders.filter((o) => !DELIVERED.includes(o.shippingStatus));
    if (notDelivered.length > 0) {
      return NextResponse.json(
        {
          error: `طلبات غير مسلَّمة: ${notDelivered.map((o) => o.orderNumber).join('، ')}`,
          code: 'NOT_DELIVERED',
        },
        { status: 409 }
      );
    }

    const currencies = new Set(orders.map((o) => o.currency));
    if (currencies.size > 1) {
      return NextResponse.json({ error: 'الطلبات بعملات مختلفة', code: 'MIXED_CURRENCY' }, { status: 409 });
    }
    if (wallet.currencyCode !== orders[0].currency) {
      return NextResponse.json(
        {
          error: `عملة المحفظة (${wallet.currencyCode}) تختلف عن عملة الطلبات (${orders[0].currency})`,
          code: 'WALLET_CURRENCY_MISMATCH',
        },
        { status: 400 }
      );
    }

    // The net: what the courier hands over after keeping their fee.
    const expected = roundMinor(
      // `expectedAmountFor` is the settlement matcher's own rule, reused
      // rather than restated: what the customer actually handed over, net of
      // the courier's fee. On a PARTIAL delivery that is `collectedAmount`,
      // not the order's full value — computing it from `totalAmount` would
      // make every partial look like the courier came up short, and accuse
      // him of a shortfall that only exists in the arithmetic.
      orders.reduce((sum, o) => sum + expectedAmountFor(o), 0),
      country.minorUnit
    );
    const amount = roundMinor(parsed.data.amount ?? expected, country.minorUnit);
    const difference = roundMinor(amount - expected, country.minorUnit);

    const party = orders[0].deliveryProvider?.name ?? 'تحصيل يدوي';

    const result = await db.$transaction(async (tx) => {
      const movement = await recordMovement(tx, {
        companyId,
        walletId: wallet.id,
        direction: 'IN',
        amount,
        party: `تحصيل يدوي — ${party}`,
        category: 'COURIER_SETTLEMENT',
        note: parsed.data.note,
        referenceType: 'MANUAL_COLLECTION',
        referenceId: orders[0].id,
        createdById: user.id,
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { settlementStatus: 'SETTLED' },
      });

      // Settled orders make their commission payable — the same rule as a
      // statement approval, reached by a different road.
      await markPayableForOrders(tx, companyId, orders.map((o) => o.id));

      for (const order of orders) {
        await tx.orderActivity.create({
          data: {
            companyId, orderId: order.id, userId: user.id,
            action: 'MANUAL_COLLECTION',
            metadata: JSON.stringify({
              wallet: wallet.name, party, movementId: movement.id, note: parsed.data.note,
            }),
          },
        });
      }

      return movement;
    });

    await logAudit({
      companyId, userId: user.id, action: 'MANUAL_COLLECTION',
      entity: 'WalletMovement', entityId: result.id,
      newData: {
        orders: orders.map((o) => o.orderNumber),
        wallet: wallet.name, party, expected, amount, difference, note: parsed.data.note,
      },
    });

    return NextResponse.json({
      orders: orders.length,
      expected,
      amount,
      difference,
      currency: wallet.currencyCode,
      message:
        difference === 0
          ? `استُلم ${amount} ${wallet.currencyCode} عن ${orders.length} طلباً`
          : `استُلم ${amount} ${wallet.currencyCode} عن ${orders.length} طلباً — بفارق ${difference} عن المتوقَّع`,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
