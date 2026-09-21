# Quality gates — every stage ships against these

A guard without a negative test is not a guard. Each gate below is a test
that must FAIL to pass before the fix, and pass after.

## Structure

- Every route in `architecture.md` resolves; every route outside it 404s.
- No file from the old frontend remains reachable.
- No new table, field or service duplicates an existing one under a
  different name. The discovery table proves this for every concept.
- No business calculation appears in frontend code. Every computed value
  is returned by an API.

## Context and access

- A store cannot be created outside a country.
- A user assigned to one country never sees the country picker.
- Switching country clears the selected store; it is never carried over.
- Every API request carries country and store context; a request without
  them is rejected at the service layer.
- A moderator requesting `/confirmation/queue` receives 403 from the API.
- A warehouse payload contains no phone and no address.
- Scope is applied inside the query. Hiding a column in the UI never
  counts as enforcement.

## Orders

- An agent cannot pull a second order while one has zero attempts.
- The 21st claim within 60 seconds is refused.
- An order with one unreserved line cannot reach READY_TO_SHIP.
- Writing SHIPPED without shipment creation is refused.
- Editing any field of a locked-state order is refused, for the owner too.
- Cancelling an order already SHIPPED is refused; it becomes
  cancel_requested.
- VOID on an order that ever reached SHIPPED is refused.
- Releasing a CONFIRMED order to the pool is refused for every role.
- A store-sourced order cannot raise an entry issue.
- An issue does not count as a cancellation against the agent, and
  created_at is unchanged after the round trip.

## Inventory

- Splitting an order displays the second delivery fee before confirming.
- A free item in a BUY_X_GET_Y bundle consumes stock and appears in COGS.
- Nothing enters stock before the count-and-inspect acknowledgement.
- With negative stock disallowed, a manifest containing an under-stocked
  line is refused and no shipment row is created.
- A cross-country warehouse transfer is refused.
- Reassigning an item between two orders on the same courier run adds
  zero delivery fee and produces a custody-to-custody movement.
- An add-on order adds no delivery fee.

## Money

- A wallet movement cannot be deleted by any role including owner.
- An unexplained non-zero closing difference blocks the next day.
- The user who recorded a movement cannot approve that day's closing.
- No fund movement exists before settlement approval.
- Receipt lines summing to less than the statement total flag the gap and
  block approval until explained.
- A partially delivered order raises no settlement exception when the
  statement matches the post-event expected amount.
- Matching never falls back to phone automatically.
- Changing a commission rule today does not alter last month's statement.
- A returned order generates zero commission for every party.

## Automation

- Running any scheduled job twice produces no duplicate side effects.
- A job that missed its window shows red on the admin screen.
- SLA counters do not advance outside business hours or on weekends.
- No automatic approval when an SLA expires. Silence is not consent.
- A barcode 404ing three times raises "shipment missing at courier".

## Storefront

- A landing page order appears in the shared pool like any other order,
  with a merchant reference and its landing_page_id.
- A blacklisted phone creates no order and receives a neutral message
  that never reveals the reason.
- The COD shown on the landing page equals the COD stored on the order.
- Changing the region updates the displayed fee from the fee table, not
  from a hardcoded value.
- Attribution captured at submission is never overwritten later.
- The Purchase conversion carries the COLLECTED amount, deduplicated by
  event_id.
- A cloned store copies structure but not prices, costs, fees or pixels.
- An installed app cannot post a fund movement under any scope.

## Other

- An OrderNote cannot be edited or deleted by any role including owner.
- Creating a new core order status via the API is refused.
- `/assistant` and `/growth/intelligence` remain two distinct screens.
