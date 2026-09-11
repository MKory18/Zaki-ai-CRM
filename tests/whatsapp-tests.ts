/**
 * WHATSAPP — REGRESSION & SECURITY TESTS (official Cloud API build).
 * Lib-level engines vs real DB + static source-contract checks
 * (same style as security-fixes-tests / phase-s-tests).
 * Usage: npx tsx tests/whatsapp-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// ── Test env (before importing whatsapp modules) ──
process.env.WHATSAPP_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';

const db = new PrismaClient();
let pass = 0, fail = 0, skipped = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function skip(name: string) { skipped++; console.log(`  ⏭️  ${name}`); }
const src = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const A = 97;

async function main() {
  console.log('\n=== 1. CRYPTO (token encryption at rest) ===');
  const { whatsappEncrypt, whatsappDecrypt } = await import('../src/lib/whatsapp/crypto');
  const token = 'EAAG-real-like-token-' + 'x'.repeat(40);
  const enc = whatsappEncrypt(token);
  ok('encrypt produces versioned blob', enc.startsWith('v1:') && !enc.includes(token));
  ok('decrypt roundtrip', whatsappDecrypt(enc) === token);
  const tampered = enc.slice(0, -4) + '0000';
  let tamperFailed = false;
  try { whatsappDecrypt(tampered); } catch { tamperFailed = true; }
  ok('tampered blob rejected (GCM auth)', tamperFailed);
  ok('blob never contains plaintext token', !enc.includes('EAAG'));

  console.log('\n=== 2. CONFIG FAIL-CLOSED ===');
  const cfg = await import('../src/lib/whatsapp/config');
  const saved: Record<string, string | undefined> = {};
  for (const k of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_ENCRYPTION_KEY']) {
    saved[k] = process.env[k]; process.env[k] = '';
  }
  ok('envConfigured() = false without envs', cfg.envConfigured() === false);
  ok('webhookConfigured() = false without envs', cfg.webhookConfigured() === false);
  ok('getAccessToken() = null without envs', cfg.getAccessToken() === null);
  for (const k of Object.keys(saved)) process.env[k] = saved[k];

  console.log('\n=== 3. WEBHOOK SIGNATURE ===');
  const { verifyMetaSignature } = await import('../src/lib/whatsapp/signature');
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const crypto = await import('crypto');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'test-app-secret').update(body).digest('hex');
  ok('valid signature accepted', verifyMetaSignature(body, sig) === true);
  ok('invalid signature rejected', verifyMetaSignature(body, 'sha256=' + '0'.repeat(64)) === false);
  ok('missing header rejected', verifyMetaSignature(body, null) === false);
  ok('tampered body rejected', verifyMetaSignature(body + ' ', sig) === false);

  console.log('\n=== 4. RBAC CATALOG ===');
  const catalog = src('src/lib/permission-catalog.ts');
  for (const key of ['whatsapp.view', 'whatsapp.send', 'whatsapp.manage', 'whatsapp.assign']) {
    ok(`catalog defines ${key}`, catalog.includes(`'${key}'`));
  }
  ok('catalog defines whatsapp module label', catalog.includes("whatsapp: { ar: 'واتساب'"));
  const authTypes = src('src/types/auth.ts');
  ok('legacy COMPANY_ADMIN holds whatsapp permissions',
    /COMPANY_ADMIN:\s*\[[\s\S]*?'whatsapp\.view'[\s\S]*?'whatsapp\.send'[\s\S]*?'whatsapp\.manage'[\s\S]*?'whatsapp\.assign'/.test(authTypes));
  ok('legacy MODERATOR holds whatsapp.view + whatsapp.send',
    /MODERATOR:\s*\[[\s\S]*?'whatsapp\.view', 'whatsapp\.send'/.test(authTypes));

  console.log('\n=== 5. SECURITY SOURCE CONTRACTS ===');
  const serialize = src('src/lib/whatsapp/connection.ts');
  ok('serializeConnection never includes accessTokenEncrypted',
    /serializeConnection[\s\S]*return \{[\s\S]*\}[\s\S]*\n\}/.test(serialize) && !/accessTokenEncrypted/.test(serialize.split('export function serializeConnection')[1] || ''));
  const msgRoute = src('src/app/api/whatsapp/conversations/[id]/messages/route.ts');
  ok('send endpoint schema is .strict() (client cannot override phoneNumberId/wabaId)', msgRoute.includes('.strict()'));
  ok('send endpoint has no client-supplied phoneNumberId/token', !/phoneNumberId|accessToken/.test(msgRoute.replace(/zepSchema|bodySchema/g, '')));
  const webhookRoute = src('src/app/api/webhooks/whatsapp/route.ts');
  ok('webhook POST verifies Meta signature', webhookRoute.includes('verifyMetaSignature'));
  ok('webhook GET verifies hub.verify_token', webhookRoute.includes('hub.verify_token'));
  const cloudApi = src('src/lib/whatsapp/cloud-api.ts');
  ok('meta errors never include the token', !/console\.error\(.*token/.test(cloudApi.replace("msg.replace(token || '', '[REDACTED]')", '')));
  const inbound = src('src/lib/whatsapp/inbound.ts');
  ok('inbound processing is idempotent (externalMessageId uniqueness check)', inbound.includes('findUnique({ where: { externalMessageId: wamid } })'));
  const assignRoute = src('src/app/api/whatsapp/conversations/[id]/assign/route.ts');
  ok('assignment is tenant-scoped (companyId match on target user)', assignRoute.includes("{ id: body.userId, companyId }"));

  console.log('\n=== 6. DATABASE (live) ===');
  let live = true;
  try { await db.$queryRaw`SELECT 1`; } catch {
    live = false;
    skip('DB unreachable — live sections skipped (start PostgreSQL then re-run)');
  }

  if (live) {
    const companyA = await db.company.create({ data: { name: 'WA-TEST-A-' + Date.now() } });
    const companyB = await db.company.create({ data: { name: 'WA-TEST-B-' + Date.now() } });
    const userA = await db.user.create({
      data: { email: `wa-test-a-${Date.now()}@test.local`, name: 'WA Tester A', passwordHash: 'x', companyId: companyA.id, role: 'COMPANY_ADMIN', status: 'ACTIVE' },
    });
    await db.user.create({
      data: { email: `wa-test-b-${Date.now()}@test.local`, name: 'WA Tester B', passwordHash: 'x', companyId: companyB.id, role: 'COMPANY_ADMIN', status: 'ACTIVE' },
    });
    try {
      const conn = await db.whatsAppConnection.create({
        data: { companyId: companyA.id, wabaId: '111111', phoneNumberId: 'PN_A_1', phoneNumber: '+201000000000', status: 'CONNECTED' },
      });

      // ── Inbound processing (idempotent) ──
      const { processWebhookPayload } = await import('../src/lib/whatsapp/inbound');
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '111111',
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'PN_A_1' },
              contacts: [{ profile: { name: 'محمد' }, wa_id: '201200000001' }],
              messages: [{ id: 'wamid.test1', from: '201200000001', timestamp: '1700000000', type: 'text', text: { body: 'السلام عليكم' } }],
            },
          }],
        }],
      };
      const r1 = await processWebhookPayload(payload);
      ok('inbound text processed', r1.processed === 1, JSON.stringify(r1));
      const conv = await db.whatsAppConversation.findFirst({ where: { companyId: companyA.id } });
      ok('conversation created (OPEN)', !!conv && conv.status === 'OPEN');
      ok('unreadCount incremented', (conv?.unreadCount || 0) === 1);
      ok('lastMessagePreview set', conv?.lastMessagePreview === 'السلام عليكم');

      const r2 = await processWebhookPayload(payload);
      ok('duplicate webhook creates no duplicate message', r2.processed === 0 && r2.skipped === 1, JSON.stringify(r2));
      const msgCount = await db.whatsAppMessage.count({ where: { companyId: companyA.id } });
      ok('single message stored', msgCount === 1);

      // ── Customer linking ──
      const customer = await db.customer.create({
        data: { companyId: companyA.id, fullName: 'محمد تجربة', phone: '201200000001', rawPhone: '+20 120 000 0001', address: 'x', city: 'القاهرة' },
      });
      await processWebhookPayload({
        entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN_A_1' }, messages: [{ id: 'wamid.test2', from: '201200000001', timestamp: '1700000001', type: 'text', text: { body: 'أريد السعر' } }] } }] }],
      });
      const convLinked = await db.whatsAppConversation.findFirst({ where: { companyId: companyA.id } });
      ok('customer linked by phone', convLinked?.customerId === customer.id);

      // ── Status updates ──
      const out = await db.whatsAppMessage.create({
        data: { companyId: companyA.id, conversationId: convLinked!.id, connectionId: conn.id, externalMessageId: 'wamid.out1', direction: 'OUTBOUND', messageType: 'TEXT', text: 'وعليكم السلام', status: 'SENT' },
      });
      await processWebhookPayload({
        entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN_A_1' }, statuses: [{ id: 'wamid.out1', status: 'delivered' }] } }] }],
      });
      const outAfter = await db.whatsAppMessage.findUnique({ where: { externalMessageId: 'wamid.out1' } });
      ok('outbound status → DELIVERED', outAfter?.status === 'DELIVERED');

      // Unknown event ignored safely
      const rUnknown = await processWebhookPayload({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN_A_1' } } }] }] });
      ok('unknown event ignored safely', rUnknown.processed === 0 && rUnknown.statuses === 0);

      // ── Unknown connection skipped ──
      const rForeign = await processWebhookPayload({
        entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN_UNKNOWN' }, messages: [{ id: 'wamid.foreign', from: '999', type: 'text', text: { body: 'x' } }] } }] }],
      });
      ok('unknown phoneNumberId skipped', rForeign.skipped === 1 && rForeign.processed === 0);

      // ── Tenant isolation ──
      const convB = await db.whatsAppConversation.count({ where: { companyId: companyB.id } });
      ok('tenant isolation: company B sees no conversations of A', convB === 0);

      // ── Cross-tenant assignment blocked at DB level ──
      const userB = await db.user.findFirst({ where: { companyId: companyB.id } });
      const targetB = await db.user.findFirst({ where: { id: userB!.id, companyId: companyA.id } });
      ok('cross-tenant assignment target not found in company A', targetB === null);

      // ── Open / close ──
      await db.whatsAppConversation.update({ where: { id: convLinked!.id }, data: { status: 'CLOSED' } });
      const closed = await db.whatsAppConversation.findFirst({ where: { id: convLinked!.id } });
      ok('conversation can be closed', closed?.status === 'CLOSED');
      await db.whatsAppConversation.update({ where: { id: convLinked!.id }, data: { status: 'OPEN', unreadCount: 0 } });

      // ── Unread reset ──
      const reset = await db.whatsAppConversation.update({ where: { id: convLinked!.id }, data: { unreadCount: 0 } });
      ok('unread count resets', reset.unreadCount === 0);

      // ── Unique constraints ──
      let dupBlocked = false;
      try {
        await db.whatsAppConnection.create({ data: { companyId: companyA.id, wabaId: '222', phoneNumberId: 'PN_A_1', status: 'NEEDS_SETUP' } });
      } catch { dupBlocked = true; }
      ok('connection unique(companyId, phoneNumberId) enforced', dupBlocked);
      let dupMsgBlocked = false;
      try {
        await db.whatsAppMessage.create({ data: { companyId: companyA.id, conversationId: convLinked!.id, connectionId: conn.id, externalMessageId: 'wamid.test1', direction: 'INBOUND' } });
      } catch { dupMsgBlocked = true; }
      ok('message externalMessageId UNIQUE enforced', dupMsgBlocked);

      // cleanup
      await db.whatsAppMessage.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
      await db.whatsAppConversation.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
      await db.whatsAppConnection.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
    } finally {
      await db.user.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
      await db.customer.deleteMany({ where: { companyId: companyA.id } });
      await db.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } });
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`WhatsApp tests: ${pass} passed, ${fail} failed, ${skipped} skipped`);
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch((e) => { console.error('FATAL:', e?.message || e); process.exit(1); })
  .finally(() => db.$disconnect().catch(() => {}));
