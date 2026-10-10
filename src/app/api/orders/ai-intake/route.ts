import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';
import { z } from 'zod';
import { db } from '@/lib/db';
import { activeOffersFor } from '@/lib/offers';
import { requireContext } from '@/lib/geo-context';
import { findOrCreateCustomer } from '@/lib/customer-identity';
import { orderRefFields } from '@/lib/order-ref';
import { resolveRegionId } from '@/lib/regions';
import { computeCod, roundMinor } from '@/lib/money';
import { count, money as amount } from '@/lib/numeric-input';
import { productCost } from '@/lib/product-cost';
import { parseOrderText, matchProduct, normalizeArabic, ParsedOrder } from '@/lib/order-parser';
import { normalizePhoneNumber } from '@/lib/phone';
import { activeBlock } from '@/lib/blacklist';
import { logAudit } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/authorization';
import { zodMessage } from '@/lib/zod-message';

/**
 * POST /api/orders/ai-intake
 * mode 1: { text, dryRun: true }  -> parse text, match product, return preview (no DB writes)
 * mode 2: { parsed, confirm: true } -> create customer + order from confirmed fields
 */

async function aiAssistedParse(text: string): Promise<ParsedOrder | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://salesflow.io',
        'X-Title': 'SALESFLOW Order Intake',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          {
            role: 'system',
            content: `You are an order-intake extraction engine for an Arabic e-commerce store.
Extract order fields from the user's free text and return ONLY valid JSON:
{"customerName":"","phone":"","governorate":"","address":"","productQuery":"","quantity":1,"price":null,"notes":"","source":""}
Rules: keep original Arabic text, quantity is a number, price is a number without currency symbols, source = page name. If a field is missing use "" (or null for price, 1 for quantity).`,
          },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          customerName: parsed.customerName || '',
          phone: parsed.phone || '',
          governorate: parsed.governorate || '',
          address: parsed.address || '',
          productQuery: parsed.productQuery || '',
          quantity: parseInt(parsed.quantity, 10) || 1,
          price: parsed.price != null ? Number(parsed.price) : null,
          notes: parsed.notes || '',
          source: parsed.source || '',
        };
      }
    }
  } catch (e) {
    console.warn('AI parse failed, using deterministic parser:', e);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, countryId, country } = await requireContext();
    await requirePermission('orders.create');

    const body = await req.json();

    // ─── Mode 2: Confirm & Create ───
    if (body.confirm) {
      // Server-side Zod validation — the client-confirmed payload is never
      // trusted with raw values (same rules as POST /api/orders).
      const confirmSchema = z.object({
        customerName: z.string().trim().min(2).max(80),
        phone: z.string().trim().min(7).max(20),
        address: z.string().trim().max(200).optional().nullable(),
        governorate: z.string().trim().max(60).optional().nullable(),
        productId: z.string().min(10).max(64),
        /**
         * THE SAME READER AND THE SAME BOUNDS AS `POST /api/orders`.
         *
         * These two were `z.coerce.number()`, which is `Number(value)`, and
         * the text above this schema says «the client-confirmed payload is
         * never trusted with raw values (same rules as POST /api/orders)» —
         * which was not true of the notation. `count(999, 1)` and
         * `amount(100000)` ARE the create door's rules, imported rather
         * than described, so `'0x10'` is a 400 here as it is there instead
         * of sixteen units or sixteen dinars.
         *
         * The bounds are unchanged; only what counts as a number is.
         */
        quantity: count(999, 1),
        finalPrice: amount(100000),
        moderatorId: z.string().min(10).max(64).optional().nullable(),
        notes: z.string().trim().max(500).optional().nullable(),
        source: z.string().trim().max(40).optional().nullable(),
      });
      const check = confirmSchema.safeParse(body.parsed);
      if (!check.success) {
        return NextResponse.json(
          { error: zodMessage(check.error) },
          { status: 400 }
        );
      }
      const p = check.data;

      if (!p.customerName || !p.phone || !p.productId) {
        return NextResponse.json(
          { error: 'الاسم والرقم والمنتج مطلوبة' },
          { status: 400 }
        );
      }

      const normalizedPhone = normalizePhoneNumber(p.phone);

      // Blacklist, company-wide. Staff get the real reason.
      const block = await activeBlock(db, companyId, p.phone);
      if (block) {
        return NextResponse.json(
          { error: `هذا الرقم محظور: ${block.reason}`, code: 'CUSTOMER_BLOCKED', blockId: block.id },
          { status: 409 }
        );
      }

      // The same identity rule every other door uses.
      const customer = await findOrCreateCustomer(db, {
        companyId,
        storeId,
        phone: normalizedPhone,
        rawPhone: p.phone.trim(),
        fullName: p.customerName.trim(),
        address: p.address?.trim() || '',
        city: p.governorate?.trim() || '',
      });

      // Tenant-validate — products must belong to THIS company
      const product = await db.product.findFirst({
        where: { id: p.productId, companyId },
        include: { batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { productionDate: 'asc' }, take: 1 } },
      });
      if (!product) {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }

      const qty = p.quantity;
      /**
       * WHAT THE REVIEWER CONFIRMED, INCLUDING A ZERO.
       *
       * This was `p.finalPrice || product.basePrice`, under a comment
       * claiming it matched `POST /orders`. It did not: that door writes
       * `sellingPrice ?? 0` and stores the zero. And `offers.ts` names this
       * very expression as the one door out of four that disagrees —
       *
       *   landing-page order (createPublicOrder)   0
       *   cart quote                               0
       *   AI intake's suggestion                   0
       *   AI intake's WRITE                       99   ← here
       *
       * — and rules, in writing, that «a price of 0 included: a free bundle
       * is a pricing decision», refusing to reinterpret one.
       *
       * ABSENT IS ALREADY REFUSED and that is what makes the fallback
       * unreachable as a safety net: `finalPrice: amount(100000)` is a
       * REQUIRED field, so a payload without it gets a 400 naming the
       * field. The only value `||` could ever catch is a zero somebody
       * typed on purpose — and turning that into 99 is money this route
       * invented, on an order a person had just confirmed.
       */
      const price = p.finalPrice;
      /**
       * THE SAME ESTIMATE THE OTHER ORDER DOORS MAKE.
       *
       * This took the oldest batch still holding units — a defensible policy
       * on its own, and a different one from `POST /orders`, which averages
       * the stock on hand. Two doors creating the same kind of order and
       * costing it two ways is exactly the drift `product-cost.ts` was
       * written to end; its own comment says a product does not have «a»
       * cost, and that the blend is a choice that shows up in the profit.
       * So the choice is made in one place and read here.
       */
      const unitCost = (await productCost(db, companyId, product.id)).average;

      // Moderator assignment — must belong to THIS company (same rule as POST /orders)
      const assignedModeratorId = p.moderatorId || (user.role === 'MODERATOR' ? user.id : null);
      if (assignedModeratorId) {
        const mod = await db.user.findFirst({ where: { id: assignedModeratorId, companyId } });
        if (!mod) {
          return NextResponse.json({ error: 'الموديريتور غير موجود في شركتك' }, { status: 404 });
        }
      }
      // Commission is the ledger's and accrues on delivery — see POST /orders.
      /**
       * ONE COD function (contract PART 5); no delivery fee at intake.
       *
       * NO `discount`, AND THAT IS NOT THE PREVIEW'S DEFECT REPEATED. This
       * door binds no offer: the confirm payload carries no `offerId`, and
       * `price` above is either the reviewer's confirmed total or the
       * product's base price. There is no `discount` column in play to pass.
       *
       * And passing the chosen offer's discount here would now subtract it
       * TWICE: the preview already hands the reviewer the net figure (25
       * with a discount of 3 is suggested as 22), the modal copies that into
       * `finalPrice`, so a second reduction here would charge 19 for an
       * offer that promises 22. The reviewer's number is final by design —
       * they may edit it, and a door that re-reduced an edited figure would
       * be arguing with the person who typed it.
       *
       * Hence this file's `NO_OFFER_BOUND` entry in
       * `quote/quote-discount.test.ts` stands, with the reason restated
       * there now that the preview does pass a discount of its own.
       */
      const money = computeCod({
        lines: [{ quantity: qty, unitPrice: qty > 0 ? price / qty : price }],
        minorUnit: country.minorUnit,
      });

      // Bind the governorate written in the message to a real Region: the
      // delivery fee is keyed on it, so an order without one cannot be priced
      // or shipped.
      const resolvedRegionId = await resolveRegionId(db, countryId, p.governorate ?? customer.city);

      /**
       * ONE TRANSACTION, BECAUSE THESE FOUR WRITES ARE ONE FACT.
       *
       * They were four separate statements. A failure between the first and
       * the second left an order with NO LINES — and a lineless order is
       * the one shape the whole product cannot price: `computeCod` has
       * nothing to total, settlement reconstructs the delivered goods from
       * the lines, and the reservation lives per line, so nothing was ever
       * taken off a shelf for it either. It was the last door in this
       * repository that could still produce one. Measured today: 0 of 56
       * live orders are lineless, so this closes the way in rather than
       * cleaning up after it.
       *
       * The other two matter less and are still the same fact: a customer
       * whose `totalOrders` counts an order that failed to save, and an
       * order whose activity trail says it was created when it was not.
       *
       * AND THE ORDER NUMBER NOW RETRIES, like the door next door. It was
       * `orderRefFields(db, companyId, prefix)` with no attempt argument —
       * so two intakes in the same second raced for one number and the
       * loser got a P2002 in the face of the person who pasted the order.
       * `nextOrderNumber` takes an attempt precisely so the retry asks for
       * the NEXT one instead of the same one again.
       *
       * The audit row and the notification stay OUTSIDE: one must not be
       * rolled back if it succeeds while something after it fails, and the
       * other talks to the world. `POST /orders` draws the line in the same
       * place.
       */
      const now = new Date();
      const order = await db.$transaction(async (tx) => {
        let created: Awaited<ReturnType<typeof tx.order.create>> | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const refs = await orderRefFields(tx, companyId, country.orderPrefix, attempt, now);
            created = await tx.order.create({
              data: {
                companyId,
                countryId,
                storeId,
                regionId: resolvedRegionId,
                ...refs,
                customerId: customer.id,
                productId: product.id,
                quantity: qty,
                sellingPrice: price,
                shippingCost: 0,
                totalAmount: money.cod,
                currency: country.currencyCode,
                moderatorId: assignedModeratorId,
                // Rounded by the currency, like the total beside it.
                estimatedCostOfGoods: roundMinor(unitCost * qty, country.minorUnit),
                productNameSnapshot: product.name,
                productImageSnapshot: product.image || null,
                status: 'NEW',
                source: p.source?.trim() || 'AI Intake',
                customerNotes: p.notes?.trim() && p.notes !== '-' ? p.notes.trim() : null,
              },
            });
            break;
          } catch (e: unknown) {
            // Two intakes racing for one order number. Retry asks for the
            // next number, not the same one.
            if ((e as { code?: string })?.code === 'P2002' && attempt < 4) continue;
            throw e;
          }
        }
        if (!created) throw new Error('Failed to generate a unique order number');

        // The order's line. Reservation and the discount share live per line.
        await tx.orderItem.create({
          data: {
            companyId,
            orderId: created.id,
            productId: product.id,
            productName: product.name,
            quantity: qty,
            unitPrice: money.subtotal / qty,
            lineTotal: money.lineTotals[0] ?? money.subtotal,
            addedById: user.id,
            addedStage: 'INTAKE',
          },
        });

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            totalOrders: { increment: 1 },
            lastOrderDate: new Date(),
            firstOrderDate: customer.firstOrderDate || new Date(),
          },
        });

        await tx.orderActivity.create({
          data: {
            companyId,
            orderId: created.id,
            userId: user.id,
            action: 'ORDER_CREATED',
            newStatus: 'NEW',
            metadata: JSON.stringify({
              source: created.source,
              intakeMethod: 'AI_PASTE',
              createdBy: user.name,
            }),
          },
        });

        /**
         * AND NO OPENING ROW IN THE STATE HISTORY, WHICH IS A RULE AND NOT
         * AN OVERSIGHT — IT WAS WRITTEN HERE AND THEN TAKEN BACK OUT.
         *
         * `POST /orders` writes `orderStatusLog` with `previousValue: null`
         * when it creates an order, and this door does not, so two doors
         * create the same kind of order and only one says so in the log the
         * confirmation workflow is measured from. That looked like an
         * inconsistency worth closing.
         *
         * It is not. `ai-proposal-only.test.ts` holds `orderStatusLog` in
         * its NEVER set — «ممنوع على أيّ ملفٍ يسأل نموذجاً، بلا استثناء» —
         * and this file asks a language model in its other mode. The rule
         * is that the file which talks to a model is not the file that
         * writes an order's state history, and a hard stop with no
         * exception is not a hard stop that takes one for tidiness. The
         * guard refused the write the moment it was added, which is the
         * guard doing its job on me.
         *
         * WHAT IS LOST IS LESS THAN IT SOUNDS: `orderActivity` above
         * records the creation with its actor and its metadata, and MEASURED
         * TODAY no reader of `orderStatusLog` looks for an opening row —
         * every one of them looks for a named TRANSITION. The landing-page
         * door cannot write one either, for a different reason
         * (`changedById` is NOT NULL and its visitor is anonymous), which
         * is why 23 of the 56 live orders have no status-log row at all.
         */

        return created;
      });

      await logAudit({
        companyId,
        userId: user.id,
        action: 'ORDER_CREATED_AI_INTAKE',
        entity: 'Order',
        entityId: order.id,
        newData: order,
      });

      // Same audience as every other new order: this store's confirmation
      // supervisors, without the person who pasted it. Never throws.
      notify({
        companyId,
        storeId,
        audience: { permission: 'confirmation.supervise' },
        actorId: user.id,
        title: 'طلب جديد',
        message: `تم إنشاء طلب جديد #${order.orderNumber} عبر الذكاء الاصطناعي بواسطة ${user.name}.`,
        type: 'ORDER_NEW',
        link: ['/confirmation/queue', '/orders'],
      });

      return NextResponse.json({ success: true, order });
    }

    // ─── Mode 1: Parse & Preview ───
    const text: string = body.text || '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'الصق نص الطلب أولاً' }, { status: 400 });
    }

    // Try AI first, fallback to deterministic parser
    let parsed = await aiAssistedParse(text);
    let engine = 'ai';
    if (!parsed) {
      parsed = parseOrderText(text);
      engine = 'deterministic';
    }
    // Deterministic parser always re-checks to fill any AI gaps
    const deterministic = parseOrderText(text);
    if (engine === 'ai') {
      for (const key of Object.keys(deterministic) as Array<keyof ParsedOrder>) {
        const dv = deterministic[key];
        const av = parsed[key];
        if (
          (typeof dv === 'string' && !av && dv) ||
          (key === 'price' && (av === null || av === undefined) && dv !== null)
        ) {
          (parsed[key] as unknown) = dv;
        }
      }
    }

    // Match product from catalog
    const products = await db.product.findMany({
      where: { companyId },
      select: { id: true, name: true, sku: true },
    });
    const match = parsed.productQuery
      ? matchProduct(parsed.productQuery, products)
      : null;

    // Suggest price from matched product's offers
    let suggestedPrice: number | null = parsed.price;
    let suggestedOfferName: string | null = null;
    if (match) {
      const offers = await activeOffersFor(db, companyId, match.id, country.minorUnit);
      const qtyOffer = offers.find((o) => o.quantity === (parsed.quantity || 1)) || offers[0];
      if (qtyOffer && (parsed.price === null || parsed.price <= 0)) {
        /*
         * WHAT THE OFFER PROMISES, AND NOW THAT IS WHAT THE VIEW SAYS.
         *
         * A second read of the offer table and a `computeCod` of its own
         * stood here, because `OfferView.price` used to be `sellingPrice` —
         * the figure BEFORE the bundle's own discount — while every door
         * charged the figure after it. Showing the reviewer 25 for a bundle
         * that charges 22 is not harmless: the modal copies this straight
         * into `finalPrice`, and their confirmation is what turns the wrong
         * number into a charge. They cannot catch an error never shown them.
         *
         * `activeOffersFor` now applies the reduction once, through
         * `allocateDiscount`, so `price` IS the charged total and a second
         * subtraction here would charge 19 for a bundle promising 22. The
         * suggestion is simply what the customer would pay.
         */
        suggestedPrice = qtyOffer.price;
        suggestedOfferName = qtyOffer.name;
      } else if (qtyOffer) {
        suggestedOfferName = qtyOffer.name;
      }
    }

    // Duplicate customer check
    let existingCustomer = null;
    if (parsed.phone) {
      const normalizedPhone = normalizePhoneNumber(parsed.phone);
      // This store's customer. Telling an agent "3 previous orders" from
      // another store's history is a fact about somebody else's shop.
      existingCustomer = await db.customer.findFirst({
        where: { companyId, storeId, phone: normalizedPhone },
        select: { fullName: true, totalOrders: true, city: true },
      });
    }

    return NextResponse.json({
      parsed,
      engine,
      matchedProduct: match,
      productMatchConfident: match ? match.score >= 16 : false,
      suggestedPrice,
      suggestedOfferName,
      existingCustomer,
    });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
