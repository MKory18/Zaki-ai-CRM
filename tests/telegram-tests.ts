/**
 * TELEGRAM — REGRESSION & SECURITY TESTS
 * Parser + lib engines vs real DB + static source-contract checks
 * (same style as whatsapp-tests / phase-s-tests).
 * Usage: npx tsx tests/telegram-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// ── Test env (before importing telegram modules) ──
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.APP_URL = 'https://example.test';

const db = new PrismaClient();
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' -- ' + extra : ''}`); }
}
const src = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

async function main() {
  console.log('\n=== 1. WEBHOOK SECRET (timing-safe) ===');
  const { verifyTelegramSecret } = await import('../src/lib/telegram/signature');
  ok('valid secret accepted', verifyTelegramSecret('test-webhook-secret') === true);
  ok('invalid secret rejected', verifyTelegramSecret('wrong-secret-0000') === false);
  ok('missing header rejected', verifyTelegramSecret(null) === false);
  ok('no configured secret fails closed', (() => {
    const saved = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = '';
    const r = verifyTelegramSecret('anything');
    process.env.TELEGRAM_WEBHOOK_SECRET = saved;
    return r === false;
  })());

  console.log('\n=== 2. CONFIG FAIL-CLOSED ===');
  const cfg = await import('../src/lib/telegram/config');
  const savedEnv: Record<string, string | undefined> = {};
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'APP_URL']) {
    savedEnv[k] = process.env[k]; process.env[k] = '';
  }
  ok('botConfigured() = false without env', cfg.botConfigured() === false);
  ok('webhookSecretConfigured() = false without env', cfg.webhookSecretConfigured() === false);
  ok('getBotToken() = null without env', cfg.getBotToken() === null);
  ok('getAppUrl() = null without env', cfg.getAppUrl() === null);
  ok('default API base is api.telegram.org', cfg.getApiBaseUrl() === 'https://api.telegram.org');
  for (const k of Object.keys(savedEnv)) process.env[k] = savedEnv[k];

  console.log('\n=== 3. PARSER — ORDER DETECTION ===');
  const { parseTelegramOrderMessage } = await import('../src/lib/telegram/parser');
  const p1 = parseTelegramOrderMessage('طلب جديد\nالاسم: أحمد\nالهاتف: 33334444\nالعنوان: عرفات\nالمنتج: ريان\nالكمية: 5');
  ok('structured message detected as order', p1.isOrder);
  ok('structured name extracted', p1.customerName === 'أحمد');
  ok('structured phone extracted', p1.phone === '33334444');
  ok('structured product extracted', p1.productText === 'ريان');
  ok('structured quantity extracted', p1.quantity === 5);
  ok('structured address extracted', p1.address === 'عرفات');

  const p2 = parseTelegramOrderMessage('محمد\n22223333\nتفرغ زينة\nماء الريان\n3');
  ok('unlabeled multi-line detected', p2.isOrder);
  ok('unlabeled phone found', p2.phone === '22223333');
  ok('unlabeled name found', p2.customerName === 'محمد');

  const p3 = parseTelegramOrderMessage('أحمد 33334444 عرفات 2 ريان');
  ok('single-line format detected', p3.isOrder);
  ok('single-line name', p3.customerName === 'أحمد');
  ok('single-line quantity', p3.quantity === 2);

  const p4 = parseTelegramOrderMessage('محمد - 22223333 - تفرغ زينة - ريان × 2');
  ok('dash-separated format detected', p4.isOrder);

  console.log('\n=== 4. PARSER — NON-ORDER ===');
  ok('greeting ignored', !parseTelegramOrderMessage('السلام عليكم').isOrder);
  ok('where-is-my-order ignored', !parseTelegramOrderMessage('وين طلبي؟').isOrder);
  ok('thanks ignored', !parseTelegramOrderMessage('شكرا').isOrder);
  ok('price question ignored', !parseTelegramOrderMessage('كم السعر؟').isOrder);
  ok('question ignored', !parseTelegramOrderMessage('عندي سؤال').isOrder);
  ok('delivered notice ignored', !parseTelegramOrderMessage('تم التوصيل').isOrder);

  console.log('\n=== 5. ARABIC NUMERALS ===');
  const ar = parseTelegramOrderMessage('محمد\n٢٢٢٢٣٣٣٣\nالعنوان: دمشق\nالمنتج: ريان');
  ok('arabic-indic digits converted', ar.isOrder && ar.phone === '22223333');

  console.log('\n=== 6. QUANTITY EXTRACTION ===');
  ok('quantity 0 captured (pipeline rejects later)',
    parseTelegramOrderMessage('الكمية: 0\nالهاتف: 33334444\nالاسم: أحمد\nالعنوان: عرفات\nالمنتج: ريان').quantity === 0);
  ok('huge quantity captured (pipeline rejects later)',
    parseTelegramOrderMessage('الكمية: 99999\nالهاتف: 33334444\nالاسم: أحمد\nالعنوان: عرفات\nالمنتج: ريان').quantity === 99999);
  ok('negative not a quantity', parseTelegramOrderMessage('الكمية: -5').quantity === undefined);

  console.log('\n=== 7. RBAC CATALOG ===');
  const catalog = src('src/lib/permission-catalog.ts');
  for (const key of ['telegram.view', 'telegram.manage', 'telegram.receive_orders']) {
    ok(`catalog defines ${key}`, catalog.includes(`'${key}'`));
  }
  ok('catalog defines telegram module label', catalog.includes("telegram: { ar: 'تيليجرام'"));
  const authTypes = src('src/types/auth.ts');
  ok('COMPANY_ADMIN holds telegram permissions',
    /COMPANY_ADMIN:\s*\[[\s\S]*?'telegram\.view'[\s\S]*?'telegram\.manage'[\s\S]*?'telegram\.receive_orders'/.test(authTypes));
  ok('auth types declare telegram Permission keys',
    authTypes.includes("'telegram.view'") && authTypes.includes("'telegram.manage'") && authTypes.includes("'telegram.receive_orders'"));

  console.log('\n=== 8. SECURITY SOURCE CONTRACTS ===');
  const webhookRoute = src('src/app/api/webhooks/telegram/route.ts');
  ok('webhook verifies secret', webhookRoute.includes('verifyTelegramSecret'));
  ok('webhook rate-limited', webhookRoute.includes('rateLimit'));
  ok('webhook caps body size', webhookRoute.includes('MAX_BODY_BYTES'));
  ok('webhook returns 403 on bad secret', webhookRoute.includes('status: 403'));
  const statusRoute = src('src/app/api/telegram/status/route.ts');
  ok('status route never returns tokens', !/getBotToken|getWebhookSecret/.test(statusRoute.split('return NextResponse.json')[1] || ''));
  const sourcesRoute = src('src/app/api/telegram/sources/route.ts');
  ok('source creation requires telegram.manage', sourcesRoute.includes("requirePermission('telegram.manage')"));
  ok('chatId regex validated', sourcesRoute.includes('-?\\d{5,25}'));
  const retryRoute = src("src/app/api/telegram/messages/[id]/retry/route.ts");
  ok('retry is tenant-checked', retryRoute.includes('message.companyId !== companyId'));
  ok('retry is idempotent for PROCESSED', retryRoute.includes("processingStatus === 'PROCESSED'"));
  const inbound = src('src/lib/telegram/inbound.ts');
  ok('edited messages never processed', inbound.includes('isEdited'));
  ok('stale updates ignored', inbound.includes('RECENT_MESSAGE_WINDOW_MS'));
  const creation = src('src/lib/telegram/order-creation.ts');
  ok('order creation uses server pricing', creation.includes('product.basePrice'));
  ok('no client-controlled status in order creation',
    !/status:\s*input\.|confirmationStatus:\s*input\./.test(creation));
  const setupRoute = src('src/app/api/telegram/webhook/setup/route.ts');
  ok('webhook setup requires telegram.manage', setupRoute.includes("requirePermission('telegram.manage')"));

  console.log('\n=== 8b. LABELED FORMAT (الأسم/الرقم/المحافظة/الطلب/الكمية/السعر/اسم الصفحة) ===');
  const fixture = 'الاسم: ريم غازي ابو مغضب\nالرقم: ٠٩٩١٤٤٣٩٠٣\nاسم المحافظة: السويداء\nالعنوان: بهم\nالطلب ( المنتج ): ماء الكمأة\nالكمية: 1\nالسعر: 18 دولار\nالملاحظات:\nاسم الصفحة: اسرار';
  const lf = parseTelegramOrderMessage(fixture);
  ok('fixture detected as order', lf.isOrder);
  ok('customerName extracted', lf.customerName === 'ريم غازي ابو مغضب');
  ok('phone extracted + normalized digits', lf.phone === '0991443903');
  ok('governorate separate from address', lf.governorate === 'السويداء');
  ok('address extracted', lf.address === 'بهم');
  ok('productText from ( المنتج ) label', lf.productText === 'ماء الكمأة');
  ok('quantity extracted', lf.quantity === 1);
  ok('priceText extracted (audit only)', lf.priceText === '18 دولار');
  ok('empty notes preserved', lf.notes === '');
  ok('pageName extracted', lf.pageName === 'اسرار');

  // tolerant labels: spaces before colon, alternate brackets, arabic numerals
  const lf2 = parseTelegramOrderMessage('الاسم : ريم\nالرقم : ٠٩٩١٤٤٣٩٠٣\nاسم المحافظة : السويداء\nالعنوان : بهم\nالطلب (المنتج): ماء الكمأة\nالكمية: ١\nالسعر: 18 دولار\nالملاحظات:\nاسم الصفحة : اسرار');
  ok('tolerant labels: name', lf2.customerName === 'ريم');
  ok('tolerant labels: phone arabic digits', lf2.phone === '0991443903');
  ok('tolerant labels: governorate', lf2.governorate === 'السويداء');
  ok('tolerant labels: arabic quantity ١', lf2.quantity === 1);
  ok('tolerant labels: pageName', lf2.pageName === 'اسرار');

  // reordered fields
  const lf3 = parseTelegramOrderMessage('الطلب: ماء الكمأة\nالكمية: 2\nالاسم: سارة\nالرقم: 0991111222\nاسم المحافظة: دمشق\nالعنوان: المزة');
  ok('reordered fields still parsed', lf3.isOrder && lf3.customerName === 'سارة' && lf3.productText === 'ماء الكمأة' && lf3.quantity === 2);

  // price variants
  const pv = parseTelegramOrderMessage('الاسم: أحمد\nالرقم: 0991111222\nالعنوان: ع\nالمنتج: ريان\nالكمية: 1\nالسعر: $18');
  ok('price variant $18', pv.priceText === '$18');
  const pv2 = parseTelegramOrderMessage('الاسم: أحمد\nالرقم: 0991111222\nالعنوان: ع\nالمنتج: ريان\nالسعر: 18 USD');
  ok('price variant USD', pv2.priceText === '18 USD');

  // page name with spaces
  const pg = parseTelegramOrderMessage('الاسم: أحمد\nالرقم: 0991111222\nالعنوان: ع\nالمنتج: ريان\nاسم الصفحة: أسرار المنتجات');
  ok('pageName keeps spaces', pg.pageName === 'أسرار المنتجات');

  // missing page name does not disqualify the order
  const mp = parseTelegramOrderMessage('الاسم: أحمد\nالرقم: 0991111222\nالعنوان: ع\nالمنتج: ريان\nالكمية: 1');
  ok('missing pageName → still an order', mp.isOrder);

  // phone with arabic numerals not confused with quantity/price
  ok('arabic phone not quantity', lf.quantity === 1 && lf.phone === '0991443903');

  console.log('\n=== 8c. SOURCE/PRICING CONTRACTS ===');
  const creation2 = creationSrc();
  function creationSrc() { return src('src/lib/telegram/order-creation.ts'); }
  ok('source includes pageName (Telegram → page)', creation2.includes("pageName?.trim() ? `Telegram → ${pageName"));
  ok('priceText stored for audit only', creation2.includes('advertised price (used as unit price)'));
  ok('source never hardcoded to pageName alone', creation2.includes("'Telegram'"));
  const inbound2 = inboundSrc();
  function inboundSrc() { return src('src/lib/telegram/inbound.ts'); }
  ok('governorate kept separate', inbound2.includes('parsed.governorate'));
  ok('priceText passed as audit-only', inbound2.includes('priceText: parsed.priceText'));

  console.log('\n=== 9. DB IDEMPOTENCY + TENANT ISOLATION (real DB, temp data) ===');
  const company = await db.company.create({ data: { name: '__tg_test_co__' } });
  try {
    const source = await db.telegramSource.create({
      data: { companyId: company.id, chatId: '-100999888777', chatType: 'supergroup', isActive: true },
    });
    ok('source created with company mapping', Boolean(source.id));

    // unique constraint blocks the same message twice
    const msgData = { companyId: company.id, chatId: '-100999888777', messageId: '1001', text: 'اختبار' };
    await db.telegramMessage.create({ data: msgData });
    let duplicateBlocked = false;
    try { await db.telegramMessage.create({ data: msgData }); } catch { duplicateBlocked = true; }
    ok('duplicate telegram message blocked by unique constraint', duplicateBlocked);

    // same chat cannot bind to a second company (partial unique index)
    const company2 = await db.company.create({ data: { name: '__tg_test_co2__' } });
    let crossTenantBlocked = false;
    try {
      await db.telegramSource.create({ data: { companyId: company2.id, chatId: '-100999888777', chatType: 'supergroup', isActive: true } });
    } catch { crossTenantBlocked = true; }
    ok('same chat cannot bind to a second company', crossTenantBlocked);
    await db.company.delete({ where: { id: company2.id } });

    // idempotency through the pipeline: same update twice → one message
    const { processTelegramUpdate } = await import('../src/lib/telegram/inbound');
    const nowSec = Math.floor(Date.now() / 1000);
    const update: any = {
      message: {
        message_id: 2002,
        chat: { id: -100999888777, type: 'supergroup', title: 'test' },
        from: { id: 555, first_name: 'مستخدم' },
        text: 'مرحبا',
        date: nowSec,
      },
    };
    await processTelegramUpdate(update);
    const r2 = await processTelegramUpdate(update);
    ok('duplicate webhook → DUPLICATE (no second insert)', r2.status === 'DUPLICATE');
    const msgs = await db.telegramMessage.findMany({ where: { companyId: company.id, messageId: '2002' } });
    ok('exactly one stored message', msgs.length === 1);
    ok('chit-chat message IGNORED', msgs[0].processingStatus === 'IGNORED');
    ok('tenant isolation: message tenant = source company', msgs[0].companyId === company.id);

    // unlinked group → not handled
    const unlinked: any = {
      message: {
        message_id: 3003,
        chat: { id: -100111222333, type: 'supergroup', title: 'unknown' },
        text: 'طلب جديد الاسم: أحمد الهاتف: 33334444 العنوان: عرفات المنتج: ريان',
        date: nowSec,
      },
    };
    const r3 = await processTelegramUpdate(unlinked);
    ok('unlinked group ignored', r3.status === 'NO_SOURCE' || r3.handled === false);

    // order-like message without mapping → zero orders created
    const orderCount = await db.order.count({ where: { companyId: company.id } });
    ok('non-order/ignored messages create zero orders', orderCount === 0);

    // topic mapping: exact topic resolves, other topic falls to no-source
    await db.telegramSource.create({
      data: { companyId: company.id, chatId: '-100999888777', chatType: 'supergroup', topicId: 42, topicName: 'طلبات', isActive: true },
    });
    const rTopic: any = {
      message: {
        message_id: 4004, message_thread_id: 42,
        chat: { id: -100999888777, type: 'supergroup', title: 'test' },
        text: 'سؤال عن السعر', date: nowSec,
      },
    };
    await processTelegramUpdate(rTopic);
    const topicMsg = await db.telegramMessage.findFirst({ where: { companyId: company.id, messageId: '4004' } });
    ok('topic message routed to topic source', topicMsg?.sourceId !== null && topicMsg !== null);

    // private chat messages are never processed
    const priv: any = {
      message: { message_id: 5005, chat: { id: 777, type: 'private' }, text: 'طلب جديد', date: nowSec },
    };
    const rPriv = await processTelegramUpdate(priv);
    ok('private chat never processed', rPriv.handled === false);

    // ── Full order creation via labeled fixture (pageName → Order.source) ──
    // DB price DIFFERENT from Telegram price proves Telegram is authoritative
    const product = await db.product.create({
      data: {
        companyId: company.id, name: 'ماء الكمأة', sku: 'TG-TRUFFLE-1',
        basePrice: 25, status: 'ACTIVE', // DB says 25 — message says 18 → 18 must win
      },
    });
    const admin = await db.user.create({
      data: {
        companyId: company.id, email: 'tg-admin@test.local', name: 'TG Admin',
        passwordHash: 'x', role: 'COMPANY_ADMIN', status: 'ACTIVE',
      },
    });
    const orderFixture: any = {
      message: {
        message_id: 6006,
        chat: { id: -100999888777, type: 'supergroup', title: 'طلبات سوريا' },
        text: 'الاسم: ريم غازي ابو مغضب\nالرقم: ٠٩٩١٤٤٣٩٠٣\nاسم المحافظة: السويداء\nالعنوان: بهم\nالطلب ( المنتج ): ماء الكمأة\nالكمية:1\nالسعر: 18 دولار\nالملاحظات:\nاسم الصفحة: اسرار',
        date: nowSec,
      },
    };
    const rOrder = await processTelegramUpdate(orderFixture);
    ok('labeled fixture → PROCESSED with order', rOrder.status === 'PROCESSED' && Boolean(rOrder.orderId));
    if (rOrder.orderId) {
      const created = await db.order.findUnique({
        where: { id: rOrder.orderId },
        include: { customer: true },
      });
      ok('order source = Telegram → اسرار', created?.source === 'Telegram → اسرار');
      // ── THE CORE PRICING RULE: Telegram price wins over DB ──
      ok('Telegram price IS the unit price (18, not DB 25)', created?.sellingPrice === 18);
      ok('sellingPrice ≠ product.basePrice (25)', created?.sellingPrice !== 25);
      ok('totalAmount = quantity × telegram price (18)', Number(created?.totalAmount) === 18);
      ok('currency = USD', created?.currency === 'USD');
      ok('customer city = governorate', created?.customer?.city === 'السويداء');
      ok('customer address = بهم', created?.customer?.address === 'بهم');
      ok('customer phone normalized', created?.customer?.phone === '0991443903');
      // idempotency: same message redelivered → same single order
      await processTelegramUpdate(orderFixture);
      const dupCount = await db.order.count({ where: { companyId: company.id, id: rOrder.orderId } });
      ok('duplicate delivery → still exactly one order', dupCount === 1);
      const reviewMsg = await db.telegramMessage.findFirst({
        where: { companyId: company.id, processingStatus: 'PROCESSED', orderId: rOrder.orderId },
      });
      ok('message stored with pageName', reviewMsg?.pageName === 'اسرار');
      await db.orderActivity.deleteMany({ where: { orderId: created!.id } });
      await db.orderStatusLog.deleteMany({ where: { orderId: created!.id } });
      await db.order.delete({ where: { id: created!.id } });
    }

    // ── quantity 3 × telegram price 18 = 54 (total server-computed) ──
    const upd54: any = {
      message: {
        message_id: 6007,
        chat: { id: -100999888777, type: 'supergroup', title: 'طلبات سوريا' },
        text: 'الاسم: سالم\nالرقم: 09922223333\nاسم المحافظة: السويداء\nالعنوان: بهم\nالمنتج: ماء الكمأة\nالكمية: 3\nالسعر: 18 دولار\nاسم الصفحة: اسرار',
        date: nowSec,
      },
    };
    const r54 = await processTelegramUpdate(upd54);
    if (r54.orderId) {
      const o54 = await db.order.findUnique({ where: { id: r54.orderId } });
      ok('qty 3 × telegram 18 → sellingPrice 18', o54?.sellingPrice === 18);
      ok('qty 3 × telegram 18 → totalAmount 54 (not 25×3)', Number(o54?.totalAmount) === 54);
      await db.orderActivity.deleteMany({ where: { orderId: o54!.id } });
      await db.orderStatusLog.deleteMany({ where: { orderId: o54!.id } });
      await db.order.delete({ where: { id: o54!.id } });
    } else ok('qty 3 order processed', false, 'no orderId');

    // ── missing price → NEEDS_REVIEW MISSING_PRICE (never silent DB fallback) ──
    const updNoPrice: any = {
      message: {
        message_id: 6008,
        chat: { id: -100999888777, type: 'supergroup', title: 'طلبات سوريا' },
        text: 'الاسم: كريم\nالرقم: 09933334444\nاسم المحافظة: السويداء\nالعنوان: بهم\nالمنتج: ماء الكمأة\nالكمية: 1\nاسم الصفحة: اسرار',
        date: nowSec,
      },
    };
    const rNoPrice = await processTelegramUpdate(updNoPrice);
    ok('missing price → NEEDS_REVIEW', rNoPrice.status === 'NEEDS_REVIEW');
    const noPriceMsg = await db.telegramMessage.findFirst({ where: { companyId: company.id, messageId: '6008' } });
    ok('reason = MISSING_PRICE', noPriceMsg?.reviewReason === 'MISSING_PRICE');
    ok('no order created without valid price', await db.order.count({ where: { companyId: company.id } }) === 0);

    // ── invalid price (negative/huge/garbage) → NEEDS_REVIEW ──
    const badPrices = ['السعر: -5', 'السعر: 999999999', 'السعر: مجاني'];
    for (let i = 0; i < badPrices.length; i++) {
      const updBad: any = {
        message: {
          message_id: 6100 + i,
          chat: { id: -100999888777, type: 'supergroup', title: 'طلبات سوريا' },
          text: `الاسم: كريم\nالرقم: 09933334444\nالعنوان: بهم\nالمنتج: ماء الكمأة\nالكمية: 1\n${badPrices[i]}\nاسم الصفحة: اسرار`,
          date: nowSec,
        },
      };
      const rBad = await processTelegramUpdate(updBad);
      ok(`invalid price rejected (${badPrices[i]})`, rBad.status === 'NEEDS_REVIEW');
    }

    // ── price parsing variants ──
    const { parseAdvertisedPrice } = await import('../src/lib/telegram/order-creation');
    ok('parse "18 دولار" → 18', parseAdvertisedPrice('18 دولار') === 18);
    ok('parse "١٨ دولار" → 18', parseAdvertisedPrice('١٨ دولار') === 18);
    ok('parse "18 USD" → 18', parseAdvertisedPrice('18 USD') === 18);
    ok('parse "18$" → 18', parseAdvertisedPrice('18$') === 18);
    ok('parse "$18" → 18', parseAdvertisedPrice('$18') === 18);
    ok('parse "18.50 دولار" → 18.5', parseAdvertisedPrice('18.50 دولار') === 18.5);
    ok('parse empty → null', parseAdvertisedPrice('') === null);
    ok('parse negative → null', parseAdvertisedPrice('-5 دولار') === null);
    ok('parse huge → null', parseAdvertisedPrice('999999999 دولار') === null);

    // cleanup order-side data
    await db.product.delete({ where: { id: product.id } });
    await db.customer.deleteMany({ where: { companyId: company.id } });
    await db.user.delete({ where: { id: admin.id } });
  } finally {
    // ── Full test-data cleanup ──
    await db.telegramMessage.deleteMany({ where: { companyId: company.id } });
    await db.telegramSource.deleteMany({ where: { companyId: company.id } });
    await db.company.delete({ where: { id: company.id } });
  }

  console.log(`\n══════════════════════════════`);
  console.log(`PASSED: ${pass}  FAILED: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
