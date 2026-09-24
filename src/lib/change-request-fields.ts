/**
 * WHAT A CHANGE REQUEST MAY TOUCH, AND WHAT EACH THING IS CALLED.
 *
 * One list, read by the route that accepts a request and by the dialog that
 * decides one. They used to keep a list each, and the lists had drifted:
 * the route accepted the city, the product, the offer and the notes, and
 * the dialog knew none of them — so four of the ten fields reached the
 * person deciding under their English code names, and three names in the
 * dialog belonged to fields no request could ever carry.
 *
 * Pure and client-safe: the dialog runs in the browser.
 */

export const CHANGEABLE_FIELDS = [
  'customerName', 'customerPhone', 'customerAltPhone', 'customerAddress', 'customerCity',
  'quantity', 'productId', 'offerId', 'discountAmount', 'customerNotes',
] as const;

export type ChangeableField = (typeof CHANGEABLE_FIELDS)[number];

export const CHANGE_FIELD_AR: Record<ChangeableField, string> = {
  customerName: 'اسم العميل',
  customerPhone: 'هاتف العميل',
  customerAltPhone: 'الهاتف البديل',
  customerAddress: 'العنوان',
  customerCity: 'المدينة',
  quantity: 'الكمية',
  productId: 'المنتج',
  offerId: 'العرض',
  discountAmount: 'الخصم',
  customerNotes: 'ملاحظات العميل',
};

export function changeFieldLabel(field: string): string {
  return (CHANGE_FIELD_AR as Record<string, string>)[field] ?? field;
}

export type ChangeValue = string | number | null;
export type Changes = Partial<Record<ChangeableField, { from?: ChangeValue; to: ChangeValue }>>;

/** The order as it stands, in the shape a change request speaks. */
export interface OrderSnapshot {
  quantity: number;
  productId: string;
  offerId: string | null;
  discountAmount: number;
  customerNotes: string | null;
  customer: {
    fullName: string;
    phone: string;
    altPhone: string | null;
    address: string;
    city: string;
  };
}

function current(order: OrderSnapshot, field: ChangeableField): ChangeValue {
  switch (field) {
    case 'customerName': return order.customer.fullName;
    case 'customerPhone': return order.customer.phone;
    case 'customerAltPhone': return order.customer.altPhone;
    case 'customerAddress': return order.customer.address;
    case 'customerCity': return order.customer.city;
    case 'quantity': return order.quantity;
    case 'productId': return order.productId;
    case 'offerId': return order.offerId;
    case 'discountAmount': return order.discountAmount;
    case 'customerNotes': return order.customerNotes;
  }
}

/**
 * Each requested change, with what it is changing FROM.
 *
 * Taken by the server at the moment of asking, never accepted from the
 * browser. A request that says only "make it 3" is unanswerable — three
 * instead of what? — and a "from" the requester typed could say anything.
 * The dialog was built to show both sides and had only ever been given one.
 */
export function withFrom(order: OrderSnapshot, changes: Changes): Changes {
  const out: Changes = {};
  for (const [field, change] of Object.entries(changes) as [ChangeableField, { to: ChangeValue }][]) {
    if (!change) continue;
    out[field] = { from: current(order, field), to: change.to };
  }
  return out;
}
