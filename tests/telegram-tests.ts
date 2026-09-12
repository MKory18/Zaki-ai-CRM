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
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
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
