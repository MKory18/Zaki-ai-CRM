import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { AiNotConfigured, aiChat } from '@/lib/ai-provider';
import { customerRisk } from '@/lib/customer-risk';
import { assistantByKey } from '@/lib/ai-assistants';
import { deriveCoreState, STATE_LABEL_AR, type StateSource } from '@/lib/order-state';

/**
 * POST /api/ai/confirmation — help with the call that is happening now.
 *
 * It sees ONE order and the history of the person on the phone. Not the
 * queue, not the company's money, not another customer: an agent asking
 * for help with a call has no business being handed the business.
 *
 * And it changes nothing. It drafts a first sentence, names a risk worth
 * knowing, and writes a message to send — the decisions (confirm, reject,
 * postpone, discount, quantity) stay with the person who is accountable
 * for them, which is the one holding the phone.
 */

const schema = z.object({ orderId: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    const assistant = assistantByKey('confirmation')!;
    await requirePermission(assistant.needs);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    // This store's order. An agent assigned to one store is not shown
    // another's customers by asking for an id.
    const order = await db.order.findFirst({
      where: { id: parsed.data.orderId, companyId, storeId },
      select: {
        id: true, orderNumber: true, totalAmount: true, currency: true,
        confirmationStatus: true, shippingStatus: true, claimedById: true,
        shippedAt: true, labelPrintedAt: true,
        customerNotes: true,
        customer: { select: { id: true, fullName: true, address: true, city: true } },
        items: { select: { productName: true, quantity: true, freeQuantity: true } },
      },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });

    const risk = order.customer ? await customerRisk(db, companyId, order.customer.id) : null;

    // The previous orders of THIS customer, as facts rather than prose: what
    // happened to each, so a risk the agent should know is visible and a
    // clean history is visibly clean instead of silently absent.
    const history = order.customer
      ? await db.order.findMany({
          where: { companyId, customerId: order.customer.id, id: { not: order.id } },
          select: { orderNumber: true, confirmationStatus: true, shippingStatus: true, createdAt: true, totalAmount: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const context = {
      order: {
        number: order.orderNumber,
        total: Number(order.totalAmount),
        currency: order.currency,
        city: order.customer?.city ?? null,
        // The address itself is not sent: what the agent needs to know is
        // whether one is missing, and an address in the payload is customer
        // data travelling for no reason.
        hasAddress: !!order.customer?.address?.trim(),
        notes: order.customerNotes ?? null,
        items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity + i.freeQuantity })),
      },
      customer: order.customer
        ? {
            name: order.customer.fullName,
            orders: risk?.orders ?? 0,
            returns: risk?.returns ?? 0,
            returnRate: risk?.returnRate ?? 0,
            tier: risk?.tier ?? 'SAFE',
            requiresPrepaymentOrApproval: risk?.requiresPrepaymentOrApproval ?? false,
            previous: history.map((h) => ({
              number: h.orderNumber,
              state: STATE_LABEL_AR[deriveCoreState(h as StateSource)],
              total: Number(h.totalAmount),
              at: h.createdAt.toISOString().slice(0, 10),
            })),
          }
        : null,
    };

    try {
      const suggestion = await aiChat({
        companyId,
        job: assistant.promptJob,
        user: JSON.stringify(context, null, 2),
        timeoutMs: 20_000,
      });
      // The facts go back too: the agent should be able to check the
      // suggestion against them rather than take it on trust.
      return NextResponse.json({ suggestion, context });
    } catch (e) {
      if (e instanceof AiNotConfigured) {
        return NextResponse.json({ suggestion: null, context, error: 'لم يُضبط مزوّد الذكاء بعد.' });
      }
      // The facts are useful on their own; a model that did not answer must
      // not take the customer's history down with it.
      return NextResponse.json({ suggestion: null, context, error: 'تعذّر الوصول إلى المزوّد.' });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
