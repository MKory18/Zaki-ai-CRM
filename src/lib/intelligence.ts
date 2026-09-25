import { whereDelivered } from './order-state';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * BUSINESS ANALYSIS over operational data.
 *
 * Not the chat assistant, and not a dashboard. A dashboard shows what
 * happened; this says what is bleeding and what to do about it. Every
 * finding names the number it is based on, because an insight nobody can
 * check is a guess with confidence.
 *
 * Two rules it holds to:
 *
 *  - Nothing is invented. Every figure here is counted from orders that
 *    exist. Where the data cannot answer a question, the answer is "not
 *    enough data", not a plausible-sounding number.
 *
 *  - A finding with too few orders behind it is noise. One return out of two
 *    orders is a 50% return rate and means nothing, so a minimum sample is
 *    required before anything is called out.
 */

/** Below this many orders, a rate is noise rather than a signal. */
export const MIN_SAMPLE = 8;

/** A return rate at or above this is bleeding, not normal variation. */
export const RETURN_ALARM = 0.2;

const RETURNED = ['RETURNED', 'RETURN_REQUESTED'];

export type Severity = 'ALARM' | 'WATCH' | 'GOOD';

export interface Finding {
  /** Stable key so the screen can group and the reader can refer to it. */
  key: string;
  title: string;
  /** The number this rests on, spelled out. */
  evidence: string;
  /** What to actually do. Never "consider optimising". */
  action: string;
  severity: Severity;
  /** Whatever the finding is about, for a link. */
  subject?: { kind: 'product' | 'region' | 'customer' | 'courier'; id: string; name: string };
  metric?: number;
}

interface Scope {
  companyId: string;
  storeId: string;
  minorUnit: number;
  currency: string;
}

function severityFor(rate: number): Severity {
  if (rate >= RETURN_ALARM) return 'ALARM';
  if (rate >= RETURN_ALARM / 2) return 'WATCH';
  return 'GOOD';
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/**
 * Products losing money to returns.
 *
 * A returned parcel costs the delivery both ways and earns nothing, so a
 * product with a high return rate can be unprofitable while looking like a
 * bestseller on revenue.
 */
export async function returningProducts(tx: Tx, scope: Scope): Promise<Finding[]> {
  const items = await tx.orderItem.findMany({
    where: { order: { companyId: scope.companyId, storeId: scope.storeId } },
    select: {
      productId: true,
      productName: true,
      order: { select: { shippingStatus: true, totalAmount: true, deliveryFee: true } },
    },
  });

  const byProduct = new Map<string, { name: string; orders: number; returned: number; lostFees: number }>();
  for (const item of items) {
    const entry = byProduct.get(item.productId) ?? { name: item.productName, orders: 0, returned: 0, lostFees: 0 };
    entry.orders++;
    if (RETURNED.includes(item.order.shippingStatus)) {
      entry.returned++;
      // The fee is spent whether or not the customer takes the parcel.
      entry.lostFees += Number(item.order.deliveryFee ?? 0);
    }
    byProduct.set(item.productId, entry);
  }

  const findings: Finding[] = [];
  for (const [productId, p] of byProduct) {
    if (p.orders < MIN_SAMPLE) continue;
    const rate = p.returned / p.orders;
    if (rate < RETURN_ALARM / 2) continue;

    findings.push({
      key: `product-returns:${productId}`,
      title: `${p.name}: مرتجعات ${pct(rate)}`,
      evidence: `${p.returned} مرتجعاً من ${p.orders} طلباً${p.lostFees > 0 ? ` · أجور توصيل ضائعة ${roundMinor(p.lostFees, scope.minorUnit)} ${scope.currency}` : ''}`,
      action:
        rate >= RETURN_ALARM
          ? 'راجع وصف المنتج وصوره وسعره — هذه النسبة تأكل ربحه. أو اشترط دفعاً مسبقاً عليه.'
          : 'راقبه: نسبته أعلى من المعتاد ولم تبلغ حد الخطر بعد.',
      severity: severityFor(rate),
      subject: { kind: 'product', id: productId, name: p.name },
      metric: rate,
    });
  }

  return findings.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0));
}

/**
 * Regions that return.
 *
 * A region returning far above the rest is usually one thing: the courier
 * serves it badly. That is a courier conversation, not a marketing one.
 */
export async function returningRegions(tx: Tx, scope: Scope): Promise<Finding[]> {
  const orders = await tx.order.findMany({
    where: { companyId: scope.companyId, storeId: scope.storeId, regionId: { not: null } },
    select: { regionId: true, shippingStatus: true, region: { select: { name: true } } },
  });

  const byRegion = new Map<string, { name: string; orders: number; returned: number }>();
  for (const o of orders) {
    const entry = byRegion.get(o.regionId!) ?? { name: o.region?.name ?? '—', orders: 0, returned: 0 };
    entry.orders++;
    if (RETURNED.includes(o.shippingStatus)) entry.returned++;
    byRegion.set(o.regionId!, entry);
  }

  const total = orders.length;
  const totalReturned = orders.filter((o) => RETURNED.includes(o.shippingStatus)).length;
  const average = total > 0 ? totalReturned / total : 0;

  const findings: Finding[] = [];
  for (const [regionId, r] of byRegion) {
    if (r.orders < MIN_SAMPLE) continue;
    const rate = r.returned / r.orders;
    // Only worth saying when it is clearly worse than the rest, not merely high.
    if (rate < RETURN_ALARM || rate <= average * 1.3) continue;

    findings.push({
      key: `region-returns:${regionId}`,
      title: `${r.name}: مرتجعات ${pct(rate)} مقابل ${pct(average)} للمتجر`,
      evidence: `${r.returned} مرتجعاً من ${r.orders} طلباً في هذه المحافظة`,
      action: 'غالباً مشكلة تغطية عند شركة الشحن في هذه المحافظة — جرّب جهة أخرى عليها وقارن.',
      severity: 'ALARM',
      subject: { kind: 'region', id: regionId, name: r.name },
      metric: rate,
    });
  }

  return findings.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0));
}

/**
 * Customers to stop shipping to.
 *
 * Feeds the blacklist: this is the evidence for the decision, and the
 * decision stays a person's.
 */
export async function riskyCustomers(tx: Tx, scope: Scope): Promise<Finding[]> {
  const orders = await tx.order.findMany({
    where: { companyId: scope.companyId, storeId: scope.storeId },
    select: {
      customerId: true,
      shippingStatus: true,
      deliveryFee: true,
      customer: { select: { fullName: true, phone: true } },
    },
  });

  const byCustomer = new Map<string, { name: string; phone: string; orders: number; returned: number; lostFees: number }>();
  for (const o of orders) {
    const entry = byCustomer.get(o.customerId) ?? {
      name: o.customer?.fullName ?? '—',
      phone: o.customer?.phone ?? '',
      orders: 0, returned: 0, lostFees: 0,
    };
    entry.orders++;
    if (RETURNED.includes(o.shippingStatus)) {
      entry.returned++;
      entry.lostFees += Number(o.deliveryFee ?? 0);
    }
    byCustomer.set(o.customerId, entry);
  }

  const findings: Finding[] = [];
  for (const [customerId, c] of byCustomer) {
    // A person is not a product: three refusals is a pattern even though
    // three orders is a small sample.
    if (c.returned < 3) continue;

    findings.push({
      key: `customer-returns:${customerId}`,
      title: `${c.name}: رفض الاستلام ${c.returned} مرات`,
      evidence: `${c.returned} مرتجعاً من ${c.orders} طلباً · أجور ضائعة ${roundMinor(c.lostFees, scope.minorUnit)} ${scope.currency}`,
      action: 'أضف رقمه إلى القائمة السوداء، أو اشترط عليه الدفع المسبق قبل الشحن.',
      severity: 'ALARM',
      subject: { kind: 'customer', id: customerId, name: `${c.name} · ${c.phone}` },
      metric: c.returned,
    });
  }

  return findings.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0));
}

/**
 * Orders whose delivery fee eats the margin.
 *
 * With the price including delivery, a cheap order in an expensive region
 * can arrive at a loss without anything looking wrong.
 */
export async function thinMarginRegions(tx: Tx, scope: Scope): Promise<Finding[]> {
  const orders = await tx.order.findMany({
    where: {
      companyId: scope.companyId,
      storeId: scope.storeId,
      // A partial delivery is the thinnest margin there is — the full
      // delivery fee was paid against a reduced collected amount — and it
      // was the one case this finding could not see.
      ...whereDelivered(),
      regionId: { not: null },
    },
    select: {
      regionId: true, totalAmount: true, collectedAmount: true, deliveryFee: true,
      region: { select: { name: true } },
    },
  });

  const byRegion = new Map<string, { name: string; orders: number; thin: number; fees: number; revenue: number }>();
  for (const o of orders) {
    // Against what was actually collected where the door recorded it: on a
    // partial delivery the fee was paid in full and less money came back,
    // which is the whole point of looking at this.
    const total = Number(o.collectedAmount ?? o.totalAmount);
    const fee = Number(o.deliveryFee ?? 0);
    if (total <= 0) continue;

    const entry = byRegion.get(o.regionId!) ?? { name: o.region?.name ?? '—', orders: 0, thin: 0, fees: 0, revenue: 0 };
    entry.orders++;
    entry.fees += fee;
    entry.revenue += total;
    // A third of the order going to delivery is where it stops being worth it.
    if (fee / total >= 0.33) entry.thin++;
    byRegion.set(o.regionId!, entry);
  }

  const findings: Finding[] = [];
  for (const [regionId, r] of byRegion) {
    if (r.orders < MIN_SAMPLE || r.thin === 0) continue;
    const share = r.thin / r.orders;
    if (share < 0.25) continue;

    findings.push({
      key: `thin-margin:${regionId}`,
      title: `${r.name}: ${r.thin} طلباً من ${r.orders} ثلث قيمته أجرة توصيل`,
      evidence: `أجور ${roundMinor(r.fees, scope.minorUnit)} من مبيعات ${roundMinor(r.revenue, scope.minorUnit)} ${scope.currency}`,
      action: 'ارفع حد الطلب الأدنى لهذه المحافظة، أو تفاوض على أجرتها مع شركة الشحن.',
      severity: 'WATCH',
      subject: { kind: 'region', id: regionId, name: r.name },
      metric: share,
    });
  }

  return findings.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0));
}

/** Everything, in one pass. */
export async function allFindings(tx: Tx, scope: Scope): Promise<Finding[]> {
  const groups = await Promise.all([
    riskyCustomers(tx, scope),
    returningProducts(tx, scope),
    returningRegions(tx, scope),
    thinMarginRegions(tx, scope),
  ]);

  const order: Record<Severity, number> = { ALARM: 0, WATCH: 1, GOOD: 2 };
  return groups.flat().sort((a, b) => order[a.severity] - order[b.severity]);
}
