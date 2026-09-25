import type { AiScope } from './ai-assistants';
import { FINANCE_PERMISSION, FINANCE_SCOPE } from './ai-assistants';

/**
 * WHAT IS ACTUALLY PUT IN FRONT OF THE MODEL.
 *
 * The assistant was handed the whole business as one JSON object: revenue,
 * cost of goods, commission, net profit, margin. Anyone who could open the
 * assistant screen could ask "how much did we make" and be told — including
 * the people whose own commission is a line in that answer.
 *
 * A prompt telling it not to say so is not a guard: the numbers are already
 * in the request, and a model can be argued with. So the facts a person may
 * not see are REMOVED before the request is built, and what is left is
 * named in the answer so nobody mistakes a partial view for the whole one.
 *
 * Nothing here decides who may see what — that is the permission engine's
 * job, as it is everywhere else. This only applies the decision.
 */

/** Which scope each fact of the business context belongs to. */
const FIELD_SCOPE: Record<string, AiScope> = {
  total_orders: 'orders',
  confirmed_orders: 'orders',
  rejected_orders: 'orders',
  postponed_orders: 'orders',
  delivered_orders: 'orders',
  confirmation_rate: 'orders',
  delivery_rate: 'orders',
  top_demanded_product: 'orders',
  highest_rejection_product: 'orders',

  revenue: 'finance',
  production_cost: 'finance',
  shipping_cost: 'finance',
  commission: 'finance',
  operational_expenses: 'finance',
  net_profit: 'finance',
  profit_margin: 'finance',
  top_profitable_product: 'finance',

  top_moderator: 'team',
};

/** Facts that belong to no scope and are never sensitive. */
const ALWAYS = new Set(['period']);

export interface ScopedContext<T> {
  context: Partial<T>;
  /** What was taken out, so the answer can say so rather than pretend. */
  removed: AiScope[];
}

/**
 * The context with everything outside the allowed scopes taken out.
 *
 * A field this map does not know is REMOVED, not kept: a number added to
 * the context later would otherwise reach the model until somebody
 * remembered to classify it, and "we forgot" is how the money got in here
 * the first time.
 */
export function scopeContext<T extends object>(context: T, allowed: AiScope[]): ScopedContext<T> {
  const out: Record<string, unknown> = {};
  const removed = new Set<AiScope>();

  for (const [key, value] of Object.entries(context)) {
    if (ALWAYS.has(key)) {
      out[key] = value;
      continue;
    }
    const scope = FIELD_SCOPE[key];
    if (scope && allowed.includes(scope)) out[key] = value;
    else if (scope) removed.add(scope);
  }

  return { context: out as Partial<T>, removed: [...removed] };
}

/**
 * The scopes THIS person may be shown, out of the ones an assistant uses.
 *
 * Money is the one that moved: it used to travel with `ai.use`, a key
 * granted so people could ask about their own orders. Seeing the company's
 * profit is a different decision and has its own key already.
 */
export function allowedScopes(
  assistantScopes: AiScope[],
  can: (permission: string) => boolean
): AiScope[] {
  return assistantScopes.filter((s) => s !== FINANCE_SCOPE || can(FINANCE_PERMISSION));
}

/** Said in the answer, so a narrowed view is never mistaken for the whole. */
export function scopeNoteAr(removed: AiScope[]): string | null {
  if (removed.length === 0) return null;
  if (removed.includes(FINANCE_SCOPE)) {
    return 'أرقام المال غير متاحة لصلاحيتك، فالإجابة مبنية على أرقام الطلبات وحدها.';
  }
  return 'بعض المجالات غير متاحة لصلاحيتك، فالإجابة مبنية على ما هو متاح منها.';
}

/**
 * THE PICKING PAYLOAD — the shelf, never the customer.
 *
 * `preparationGroups` carries a customer name and a region on every line,
 * because the screen shows them to a person standing at a bench with the
 * order in their hand. The model is not that person: it is asked what to
 * pick and what is short, and a name and a town in that request would be
 * customer data travelling somewhere nobody is accountable for it.
 *
 * So the lines are dropped entirely and only the product totals are built
 * here, in one named function, rather than by whoever writes the next
 * caller remembering to leave two fields out.
 */
export interface PickingProduct {
  product: string;
  sku: string | null;
  /** The only proxy for a shelf this system has — products have no location. */
  category: string | null;
  orders: number;
  required: number;
  available: number;
  shortage: number;
}

interface PreparationLike {
  productId: string;
  productName: string;
  orders: number;
  required: number;
  available: number;
  shortage: number;
}

export function pickingPayload(
  groups: PreparationLike[],
  shelf: Map<string, { sku: string | null; category: string | null }>
): PickingProduct[] {
  return groups.map((g) => ({
    product: g.productName,
    sku: shelf.get(g.productId)?.sku ?? null,
    category: shelf.get(g.productId)?.category ?? null,
    orders: g.orders,
    required: g.required,
    available: g.available,
    shortage: g.shortage,
  }));
}
