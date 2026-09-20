# Courier integrations

One courier is handled by a person today: someone hands over the parcels,
writes the tracking number on the shipment screen, and updates the status
from what the courier says. `manual.ts` is that, written down.

An automated courier is a second implementation of `CourierAdapter` in
`types.ts` and nothing else. Register it in `index.ts`, then switch
`apiEnabled` on for that provider — until someone does, the provider stays
manual, which is the safe default.

## The rule that does not bend

A courier reports what it observed. **We** decide what it means.

`COURIER_CANNOT_ASSERT` holds `DELIVERED`, `RETURNED` and `CANCELLED`. A feed
may never set those, and `mapStatus` must return `null` for any code it does
not recognise rather than guessing a near match. DELIVERED makes commission
accrue and money expected from the courier; RETURNED reverses it. Moving
money because of a string we do not understand is the one failure that cannot
be undone with an apology, so both stay a human decision taken against the
courier's own statement.

In-transit statuses (`SHIPPED`, `OUT_FOR_DELIVERY`, `FAILED_DELIVERY`) move no
money and may be applied automatically — through the normal transition
machine in `shipping-workflow.ts`, never by writing the column directly.

## LogesTechs — blocked, and on what

LogesTechs publishes no publicly readable API specification; it is issued to
partners. The adapter cannot be written against a guess, because a wrong
status mapping moves money. What is needed from them, as one request:

1. **API documentation** — base URL, authentication scheme, and the request
   and response bodies for: create shipment, fetch shipment status, and bulk
   status for a list of tracking numbers.
2. **A test key and a sandbox account**, so the mapping can be proven against
   their real responses before a single live parcel depends on it.
3. **The full list of their status codes**, verbatim, with the meaning of
   each — including their partial-delivery and returned codes, and whether a
   collected amount is reported and in what field.
4. **Their webhook support**, if any: whether they can push status changes,
   what they sign the payload with, and their retry behaviour. Without it the
   Stage 7 worker polls instead, which is fine but slower and chattier.

Point 3 is the one people forget and the one that matters most here: the
mapping table from their codes to `ShippingStatus` is the whole risk surface.
