import { notFound, redirect } from 'next/navigation';
import { guardRoute } from '@/lib/page-guard';

/**
 * AN ORDER HAS AN ADDRESS.
 *
 * Three screens linked to `/orders/<id>` — the confirmation queue when it
 * refuses a pull and names the order in the way, the matching screen from
 * every line of a statement, and the WhatsApp inbox beside a conversation —
 * and no page answered there. Each of those links ended in a 404, and each
 * is the moment somebody is looking at a problem and reaching for the order
 * behind it.
 *
 * The order was never missing, only its URL. An order opens as a panel on
 * the orders list, and the list already knows how to open one by id —
 * `?highlight=<id>`, which the discount alerts have always linked to. So
 * this address is a door to that: the same panel, over the same list, from
 * a link that can be written without knowing how the screen is built.
 *
 * ── AND WHY NOT A PAGE OF ITS OWN ──
 *
 * The order panel is the biggest single piece of this product — the lines,
 * the history, the notes, the change requests, the contact log — and a
 * second place that renders it is a second place to keep correct. A
 * redirect costs the person one extra navigation they do not see, and
 * leaves exactly one implementation. If an order ever earns a full page, it
 * replaces the destination of this redirect and no link anywhere changes.
 *
 * `redirect`, not `permanentRedirect`: the destination is the thing that
 * may change, and a browser that cached a 308 would keep going to the old one.
 */

/** An order's id is a uuid. Anything else was typed into the address bar. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // The same door the list has. Somebody who may not open the orders screen
  // gets the same refusal here, and never learns whether the id was real.
  await guardRoute('/orders');

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  redirect(`/orders?highlight=${id}`);
}
