/**
 * THE GOLDEN PATH — one order, every door, the same figure traced.
 *
 * «At every step, trace the SAME figure. Any stop where the number changes
 * without a rule explaining it is a P0.» — تشطيب ١, stage 4.
 *
 * Every stop in this system is proven on its own: there are 440 test files
 * and eight invariant ledgers. NOTHING proved the figure survives the
 * HANDOFFS between them, because there is no e2e harness in the repository
 * at all. This is that harness, and it is deliberately not a vitest file:
 * it speaks to a RUNNING server over HTTP, through the same doors a browser
 * uses, with a real session cookie — so a guard that exists only in a route
 * handler, a permission, or a serialiser is exercised rather than mocked.
 *
 * It is READ-MOSTLY on purpose. It creates one order and walks it; it never
 * deletes, never touches another order, and prints what it did so the row
 * can be found afterwards.
 *
 *   npx tsx scripts/golden-path.ts
 *
 * Requires the dev server on :3000 and a user it can sign in as. Pass
 * GOLDEN_EMAIL / GOLDEN_PASSWORD, or it will tell you what to create.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const BASE = process.env.GOLDEN_BASE || 'http://localhost:3000';

type Stop = { stop: string; figure: string; value: number | string | null; note?: string };
const trace: Stop[] = [];
const problems: string[] = [];

function record(stop: string, figure: string, value: number | string | null, note?: string) {
  trace.push({ stop, figure, value, note });
}
function problem(what: string) {
  problems.push(what);
}

let cookie = '';

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* an HTML error page is also an answer */
  }
  return { status: res.status, body: body as Record<string, unknown>, raw: res };
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const session = setCookie.split(';')[0];
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!session.startsWith('salesflow_session=')) {
    throw new Error(`sign-in failed (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  if (body.twoFactor && body.twoFactor !== 'none') {
    throw new Error(`this account needs a second factor (${String(body.twoFactor)}) — use a role outside TWO_FACTOR_ROLES`);
  }
  cookie = session;
  return body;
}

/**
 * PICK THE COUNTRY AND THE STORE — the thing `/entry` does in a browser.
 *
 * `requireContext` reads a signed, HTTP-only cookie bound to the user id, and
 * every door that touches money refuses without it («اختر البلد والمتجر
 * أولاً»). A script that only signs in gets exactly as far as a person who
 * never picked a shop, which is the right behaviour and a real stop on this
 * walk: the guard is at the API, not on the sidebar.
 */
async function pickContext(countryId: string, storeId: string) {
  const res = await fetch(`${BASE}/api/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ countryId, storeId }),
  });
  const set = res.headers.get('set-cookie') ?? '';
  const ctx = set.split(';')[0];
  if (!ctx.startsWith('salesflow_ctx=')) {
    throw new Error(`context not granted (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  cookie = `${cookie}; ${ctx}`;
}

/* ──────────────────────────────────────────────────────────────────────
 * STOP 1 — the order enters, through the landing page a customer sees.
 * ────────────────────────────────────────────────────────────────────── */
async function stopOneOrderEnters() {
  const page = await db.landingPage.findFirst({
    where: { isPublished: true },
    select: { slug: true, productId: true, storeId: true },
  });
  if (!page) throw new Error('no published landing page to order from');

  /*
   * A BREAKING ORDER when asked for: «a partial delivery» and «a
   * free-delivery product» are two of the six the brief names, and the plain
   * walk cannot show either — every offer in this database includes delivery
   * and sells one unit, so the fee is zero and nothing can be partly taken.
   * GOLDEN_BREAKING=1 picks a multi-unit offer that does NOT include
   * delivery, which is the only shape where the figure can drift.
   */
  const breaking = process.env.GOLDEN_BREAKING === '1';
  const offer = await db.offer.findFirst({
    where: {
      productId: page.productId ?? undefined,
      status: 'ACTIVE',
      ...(breaking ? { quantity: { gte: 2 }, deliveryIncluded: false } : {}),
    },
    orderBy: breaking ? { quantity: 'desc' } : undefined,
    select: { id: true, name: true, quantity: true, freeQuantity: true, sellingPrice: true, discount: true, deliveryIncluded: true },
  });
  const region = await db.region.findFirst({ where: { isActive: true }, select: { name: true } });
  if (!region) throw new Error('no active region');

  const store = await db.store.findFirst({
    where: { id: page.storeId ?? undefined },
    select: { priceIncludesDelivery: true, country: { select: { minorUnit: true, currencyCode: true } } },
  });

  record('0 · الإعداد', 'سعر العرض', offer?.sellingPrice ?? null, offer?.name ?? 'بلا عرض — سعر المنتج');
  record('0 · الإعداد', 'العرض يشمل التوصيل', String(offer?.deliveryIncluded ?? false));
  record('0 · الإعداد', 'سياسة المتجر تشمل التوصيل', String(store?.priceIncludesDelivery ?? false));

  // A Jordanian mobile: the store's country decides the rule, and the public
  // door refuses anything else — which is invariant 4 of the customer section
  // proving itself at the first stop.
  const phone = `079${String(Date.now()).slice(-7)}`;
  const res = await api(`/api/public/landing-pages/${page.slug}/orders`, {
    method: 'POST',
    body: JSON.stringify({
      full_name: 'المسار الذهبي',
      phone,
      address: 'شارع الاختبار، بناء ١٢',
      city: region.name,
      ...(offer ? { offerId: offer.id } : {}),
      notes: 'طلب أنشأه سكربت المسار الذهبي',
    }),
  });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`the public door refused the order (${res.status}): ${JSON.stringify(res.body).slice(0, 400)}`);
  }

  const orderNumber = String(
    (res.body.orderNumber as string) ?? ((res.body.order as Record<string, unknown>)?.orderNumber as string) ?? ''
  );
  if (!orderNumber) throw new Error(`the door answered 200 with no order number: ${JSON.stringify(res.body).slice(0, 300)}`);

  const order = await db.order.findFirst({
    where: { orderNumber },
    select: {
      id: true, orderNumber: true, totalAmount: true, deliveryFee: true, discountAmount: true,
      priceIncludesDelivery: true, currency: true, confirmationStatus: true, shippingStatus: true,
      storeId: true, merchantRef: true,
      items: { select: { productId: true, quantity: true, freeQuantity: true, unitPrice: true, discountShare: true, reservedQty: true } },
    },
  });
  if (!order) throw new Error(`order ${orderNumber} was answered but is not in the database`);

  record('١ · دخل الطلب', 'الإجمالي (COD)', Number(order.totalAmount));
  record('١ · دخل الطلب', 'أجرة التوصيل', Number(order.deliveryFee ?? 0));
  record('١ · دخل الطلب', 'السعر يشمل التوصيل', String(order.priceIncludesDelivery));
  record('١ · دخل الطلب', 'المرجع للشركة', order.merchantRef ?? '— غائب —');

  /*
   * THE RULE FIXED ON 2026-10-02: «if ANY line includes delivery, the whole
   * order does». Every offer in this database says it includes delivery and
   * the store's own policy says it does not, so this order is the exact case
   * the fix was for — and `priceIncludesDelivery` on the row is the proof.
   */
  if (offer?.deliveryIncluded && !order.priceIncludesDelivery) {
    problem(
      `الطلب ${orderNumber}: العرض «${offer.name}» يقول إنّ السعر يشمل التوصيل، والطلب كُتب بعكس ذلك — وهي القاعدة التي أُصلحت في public-order.ts`
    );
  }
  if (!order.merchantRef) {
    problem(`الطلب ${orderNumber}: بلا مرجع تاجر — والعقد يطلبه عند كل باب`);
  }

  return { order, offer, store };
}

/** The order as the database holds it right now — the figure after a stop. */
async function reread(id: string) {
  const o = await db.order.findUnique({
    where: { id },
    select: {
      id: true, orderNumber: true, version: true, totalAmount: true, deliveryFee: true,
      collectedAmount: true, priceIncludesDelivery: true, confirmationStatus: true,
      shippingStatus: true, settlementStatus: true, estimatedCostOfGoods: true,
      items: { select: { id: true, quantity: true, freeQuantity: true, reservedQty: true, deliveredQty: true, unitPrice: true, discountShare: true } },
    },
  });
  if (!o) throw new Error('the order vanished mid-walk');
  return o;
}

/* ──────────────────────────────────────────────────────────────────────
 * STOPS 2–6 — the agent confirms, the warehouse holds the goods, the
 * parcel ships, part of it is taken at the door, and the money is counted.
 *
 * Each stop asserts the figure the NEXT stop will read, because a loop only
 * breaks at a handoff.
 * ────────────────────────────────────────────────────────────────────── */
async function walk(orderId: string) {
  // ── 2 · the agent confirms ──
  let o = await reread(orderId);
  const confirm = await api(`/api/orders/${orderId}/confirmation`, {
    method: 'POST',
    body: JSON.stringify({ action: 'confirm', expectedVersion: o.version }),
  });
  if (confirm.status !== 200) {
    problem(`٢ · التأكيد رُفض (${confirm.status}): ${JSON.stringify(confirm.body).slice(0, 220)}`);
    return;
  }
  o = await reread(orderId);
  record('٢ · التأكيد', 'الإجمالي (COD)', Number(o.totalAmount));
  record('٢ · التأكيد', 'المحجوز من المخزون', o.items.reduce((s, i) => s + i.reservedQty, 0));
  /*
   * A LINE LEFT UNRESERVED IS NOT A DEFECT ON ITS OWN.
   *
   * The first run of this script called «reserved 0 of 1» a problem and it
   * was wrong: the shelf was empty, the country disallows negative stock, so
   * `reserveOrderLines` leaves the line unreserved ON PURPOSE and the
   * READY_TO_SHIP guard then refuses the order. That is the contract working.
   *
   * So the shelf is read first, and only a line that COULD have been held
   * and was not is a problem.
   */
  const needed = o.items.reduce((s, i) => s + i.quantity + i.freeQuantity, 0);
  const held = o.items.reduce((s, i) => s + i.reservedQty, 0);
  const shelf = await db.productionBatch.aggregate({
    where: {
      productId: { in: (await db.orderItem.findMany({ where: { orderId }, select: { productId: true } })).map((i) => i.productId) },
      quantityRemaining: { gt: 0 },
    },
    _sum: { quantityRemaining: true },
  });
  const available = shelf._sum.quantityRemaining ?? 0;
  record('٢ · التأكيد', 'على الرف وقت التأكيد', available);
  if (held !== needed && available >= needed) {
    problem(`٢ · التأكيد حجز ${held} من ${needed} والرف فيه ${available} — فالسطر كان يمكن حجزه ولم يُحجز`);
  } else if (held !== needed) {
    record('٢ · التأكيد', 'لماذا لم يُحجز', `الرف فيه ${available} والمطلوب ${needed} — والدولة تمنع السالب`);
  }

  // ── 3 · the warehouse prepares, then marks ready ──
  /*
   * THE ORDER THE MACHINE ALLOWS, read from `shipping-workflow.ts` rather
   * than guessed: NOT_READY → READY_FOR_SHIPPING → PACKING →
   * READY_FOR_PICKUP → SHIPPED. The first guess here was the intuitive
   * one — pack, then declare ready — and the machine refused it, which is
   * the machine doing its job.
   */
  for (const to of ['READY_FOR_SHIPPING', 'PACKING', 'READY_FOR_PICKUP']) {
    o = await reread(orderId);
    const r = await api(`/api/orders/${orderId}/shipping`, {
      method: 'POST',
      body: JSON.stringify({ action: 'transition', to, expectedVersion: o.version }),
    });
    if (r.status !== 200) {
      problem(`٣ · الانتقال إلى ${to} رُفض (${r.status}): ${JSON.stringify(r.body).slice(0, 220)}`);
      return;
    }
  }
  o = await reread(orderId);
  record('٣ · المستودع', 'الإجمالي (COD)', Number(o.totalAmount));
  record('٣ · المستودع', 'الحالة', o.shippingStatus);

  // ── 4 · it ships ──
  const provider = await db.deliveryProvider.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  o = await reread(orderId);
  const ship = await api(`/api/orders/${orderId}/shipping`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'transition', to: 'SHIPPED', expectedVersion: o.version,
      ...(provider ? { deliveryProviderId: provider.id } : {}),
      trackingNumber: `GP-${Date.now().toString(36).toUpperCase()}`,
    }),
  });
  if (ship.status !== 200) {
    problem(`٤ · الشحن رُفض (${ship.status}): ${JSON.stringify(ship.body).slice(0, 220)}`);
    return;
  }
  o = await reread(orderId);
  record('٤ · الشحن', 'الإجمالي (COD)', Number(o.totalAmount));
  record('٤ · الشحن', 'أجرة التوصيل', Number(o.deliveryFee ?? 0));

  // ── 5 · part of it is taken at the door ──
  const line = o.items[0];
  const takeSome = line.quantity > 1;
  const deliver = await api('/api/ops/tracking/deliver', {
    method: 'POST',
    body: JSON.stringify(
      takeSome
        ? { orderId, lines: [{ itemId: line.id, deliveredQty: line.quantity - 1 }], note: 'المسار الذهبي: تسليم جزئي' }
        : { orderId, outcome: 'ALL', note: 'المسار الذهبي: تسليم كامل' }
    ),
  });
  if (deliver.status !== 200) {
    problem(`٥ · التسليم رُفض (${deliver.status}): ${JSON.stringify(deliver.body).slice(0, 220)}`);
    return;
  }
  o = await reread(orderId);
  record('٥ · التسليم', 'المقبوض فعلاً', o.collectedAmount === null ? 'null (أي: قُبض كلُّه)' : Number(o.collectedAmount));
  record('٥ · التسليم', 'كلفة البضاعة المسجَّلة', Number(o.estimatedCostOfGoods ?? 0));
  record('٥ · التسليم', 'الحالة', o.shippingStatus);

  // ── 6 · what the courier owes — the figure the two screens disagreed on ──
  /*
   * WITH THE FILTER. The screen's default list is IN_FLIGHT — a delivered
   * parcel is no longer in flight, so it is not in the default answer. The
   * first run of this script called that a defect and it was wrong.
   */
  const tracking = await api(`/api/ops/tracking?status=${o.shippingStatus}`);
  const rows = ((tracking.body as { orders?: Record<string, unknown>[] }).orders ?? []) as Record<string, unknown>[];
  const row = rows.find((r) => r.id === orderId);
  if (!row) {
    problem('٦ · الطلب لا يظهر في شاشة التتبّع بعد تسليمه — فلا يمكن تحصيله');
    return;
  }
  const expected = Number(row.expectedCollection ?? NaN);
  record('٦ · التحصيل', 'ما تنتظره التسوية', Number.isNaN(expected) ? '— لم تُرسَل —' : expected);

  /*
   * THE FIX OF 2026-10-02, PROVED THROUGH THE DOOR: the selection bar used
   * to print `totalAmount − deliveryFee` while the dialog beside it summed
   * `expectedCollection`. Here both are read from the same row.
   */
  const oldFormula = Number(o.totalAmount) - Number(o.deliveryFee ?? 0);
  record('٦ · التحصيل', 'الصيغة القديمة للشريط', oldFormula);
  if (!Number.isNaN(expected) && expected !== oldFormula) {
    console.log(
      `\n  ↳ الشريط كان سيطبع ${oldFormula} والنافذة ${expected} — الفرق ${Math.abs(oldFormula - expected)}. ` +
        'هذه هي المخالفة التي أُصلحت اليوم، ظاهرةً على طلبٍ حقيقي.'
    );
  }
  if (Number.isNaN(expected)) {
    problem('٦ · شاشة التتبّع لا ترسل expectedCollection — والشاشة تحتاجه لتعرض الصافي');
  }
}

async function main() {
  const email = process.env.GOLDEN_EMAIL;
  const password = process.env.GOLDEN_PASSWORD;

  console.log('── المسار الذهبي ───────────────────────────────');
  const up = await fetch(`${BASE}/api/public/landing-pages/x/meta`).then(() => true).catch(() => false);
  if (!up) throw new Error(`no server answering at ${BASE} — start the dev server first`);

  const { order } = await stopOneOrderEnters();

  if (email && password) {
    const who = await signIn(email, password);
    console.log(`موقَّع باسم: ${String((who.user as Record<string, unknown>)?.name ?? email)}`);
  } else {
    console.log('(بلا GOLDEN_EMAIL/GOLDEN_PASSWORD — المحطّات التي تحتاج جلسة ستُتخطّى)');
  }

  if (cookie) {
    const store = await db.store.findFirst({ select: { id: true, countryId: true, name: true } });
    if (!store) throw new Error('no store to work in');
    await pickContext(store.countryId, store.id);
    console.log(`السياق: ${store.name}`);
    await walk(order.id);
  }

  console.log('');
  console.log('الرقم عبر المحطّات:');
  for (const t of trace) {
    console.log(`  ${t.stop.padEnd(18)} ${t.figure.padEnd(26)} ${String(t.value)}${t.note ? `   (${t.note})` : ''}`);
  }

  console.log('');
  if (problems.length === 0) {
    console.log('لا خلل في المحطّات التي مُشِيَت.');
  } else {
    console.log(`خلل (${problems.length}):`);
    for (const p of problems) console.log(`  · ${p}`);
  }
  console.log('');
  console.log(`الطلب الذي أُنشئ: ${order.orderNumber}  (${order.id})`);
}

main()
  .catch((e) => {
    console.error('توقّف:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
