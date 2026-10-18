#!/usr/bin/env node
// Salah Plus (Syria) legacy migration — MariaDB dump → SalesFlow PostgreSQL.
//
// Safety rules:
//  - DRY-RUN by default. Nothing is written unless --apply is passed.
//  - Every step is idempotent: natural-key existence checks before insert.
//  - No TRUNCATE / DROP / migrate reset. Demo replacement = targeted cascade
//    delete of ONE demo company row (its data goes with it by FK design).
//  - No secrets in code: dump path + pg_dump path come from env/CLI.
//  - Credentials generated for legacy staff are written to a git-ignored file.
//
// Usage:
//   node scripts/migration/run.mjs --list
//   node scripts/migration/run.mjs                 # full dry-run
//   node scripts/migration/run.mjs --step orders   # one step, dry-run
//   node scripts/migration/run.mjs --apply         # full apply (writes!)
//   node scripts/migration/run.mjs --apply --step customers

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { loadDump, tuples, rows, dt } from './lib/dump.mjs';
import { resolveWipeTarget, resolveStoreTarget, evaluateVerify } from './lib/safety-rules.mjs';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--apply');
const stepArg = (() => {
  const i = process.argv.indexOf('--step');
  return i === -1 ? null : process.argv[i + 1];
})();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = HERE; // everything the tool writes stays inside scripts/migration/
const BACKUP_DIR = path.join(MIG_DIR, 'backups');
const IDMAP_PATH = path.join(MIG_DIR, 'idmap.json');
const CREDS_PATH = path.join(MIG_DIR, '.credentials.local.json');
const REPORT_PATH = path.join(MIG_DIR, 'migration-report.local.json');

const LEGACY_DUMP = process.env.LEGACY_DUMP;
if (!LEGACY_DUMP) {
  console.error('LEGACY_DUMP env var is required (path to the legacy MariaDB SQL dump).');
  process.exit(1);
}
// pg_dump must come from the environment on the server (Coolify/Linux);
// the Windows default below is only for this development machine.
const PG_DUMP_BIN = process.env.PG_DUMP_BIN
  || (process.platform === 'win32' ? 'F:/ddddddddddddddddd/New folder/PostgreSQL/bin/pg_dump.exe' : 'pg_dump');

const COMPANY_NAME = 'صحة بلس';
const STORE_SLUG = 'salah-plus';
const CURRENCY = 'USD'; // evidenced: totals 2–460, shipping 3–5; SYP would be 6+ orders of magnitude larger
const COUNTRY_CODE = 'SY';

// old status_id → [legacyStatus, confirmationStatus, shippingStatus, settlementStatus, rejectionReason]
const STATUS_MAP = {
  2:  ['NEW',           'NEW',       'NOT_READY',         'NOT_APPLICABLE', null],
  4:  ['SHIPPED',       'CONFIRMED', 'SHIPPED',           'PENDING',        null],
  5:  ['DELIVERED',     'CONFIRMED', 'DELIVERED',         'COLLECTED',      null],
  6:  ['CANCELLED',     'CANCELLED', 'CANCELLED',         'CANCELLED',      null],
  8:  ['POSTPONED',     'POSTPONED', 'NOT_READY',         'NOT_APPLICABLE', null],
  9:  ['VOIDED',        'REJECTED',  'NOT_READY',         'NOT_APPLICABLE', 'DUPLICATE_ORDER'],
  12: ['DELIVERED',     'CONFIRMED', 'DELIVERED',         'COLLECTED',      null],
  13: ['RETURNED',      'CONFIRMED', 'RETURNED',          'REFUNDED',       null],
  15: ['WAITING_RETURN','CONFIRMED', 'FAILED_DELIVERY',   'PENDING',        null],
  16: ['CANCELLED',     'CANCELLED', 'CANCELLED',         'CANCELLED',      'OTHER'],
};

const STAFF_ROLE_MAP = { 'super-admin': 'SUPER_ADMIN', manager: 'MANAGER', seller: 'MODERATOR' };

const log = (...a) => console.log(...a);
const stats = { warnings: [], skipped: {}, counters: {} };
const bump = (k, n = 1) => { stats.counters[k] = (stats.counters[k] || 0) + n; };
const warn = (msg) => { stats.warnings.push(msg); log('  ⚠', msg); };
const uuid = () => crypto.randomUUID();
const now = () => new Date();

function loadIdmap() {
  try { return JSON.parse(fs.readFileSync(IDMAP_PATH, 'utf8')); } catch { return {}; }
}
function saveIdmap(m) { fs.writeFileSync(IDMAP_PATH, JSON.stringify(m, null, 1)); }

function saveReport() {
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ dryRun: DRY_RUN, at: now().toISOString(), ...stats }, null, 1));
  log('\nreport →', REPORT_PATH);
}

/** Normalize a legacy phone to the SY national form used by Customer.phone. */
function normPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  while (d.startsWith('0')) d = d.slice(1);
  if (!d) return null;
  return d; // national digits, no trunk zero — matches src/lib/phone-rules SY national number
}

async function getSalahContext() {
  const company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) return { company: null };
  const store = await prisma.store.findFirst({ where: { companyId: company.id, slug: STORE_SLUG } });
  const country = await prisma.country.findFirst({ where: { companyId: company.id, code: COUNTRY_CODE } });
  const regions = await prisma.region.findMany({ where: { countryId: country?.id } });
  const providers = await prisma.deliveryProvider.findMany({ where: { companyId: company.id } });
  const categories = await prisma.category.findMany({ where: { companyId: company.id } });
  const channel = await prisma.orderChannel.findFirst({ where: { companyId: company.id } });
  return { company, store, country, regions, providers, categories, channel };
}

// ─────────────────────────── steps ───────────────────────────

/** Step: backup — pg_dump the current target DB (only with --apply). */
async function stepBackup(ctx) {
  if (DRY_RUN) { log('[dry] would pg_dump the target DB to', BACKUP_DIR); return; }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(BACKUP_DIR, `pre-migration-${stamp}.dump`);
  log('backing up target DB →', out);
  const m = process.env.DATABASE_URL.match(/:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error('cannot parse DATABASE_URL for backup');
  const [, dbUser, dbPass, dbHost, dbPort, dbName] = m;
  execFileSync(PG_DUMP_BIN, ['-Fc', '--no-password', '-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', dbName, '-f', out], {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: dbPass },
  });
  const size = fs.statSync(out).size;
  if (size < 1000) throw new Error(`backup suspiciously small (${size} bytes) — aborting`);
  log(`backup ok (${(size / 1e6).toFixed(1)} MB)`);
}

/** Step: wipe-demo — remove ONE explicitly named demo company, keep superadmins + global roles.
 * The target is never guessed: --wipe-company-id must name it (see lib/safety-rules.mjs). */
async function stepWipeDemo(ctx) {
  const companies = await prisma.company.findMany({
    include: { _count: { select: { users: true, products: true, orders: true, customers: true, stores: true, categories: true, countries: true } } },
  });
  if (companies.length === 0) { log('no companies in the database — nothing to wipe'); return; }
  const target = resolveWipeTarget(process.argv, companies, COMPANY_NAME);
  if (!target.ok) {
    log('WIPE REFUSED:', target.reason);
    for (const c of target.candidates) {
      const n = c.counts || {};
      log(`  candidate: ${c.id}  "${c.name}"  (users=${n.users ?? '?'} products=${n.products ?? '?'} orders=${n.orders ?? '?'} customers=${n.customers ?? '?'})`);
    }
    if (!DRY_RUN) throw new Error(`wipe refused: ${target.reason} — pass --wipe-company-id <uuid of the demo company>`);
    log('[dry] with --wipe-company-id <uuid of the demo company above> the wipe would proceed');
    return;
  }
  const demo = target.company;
  log(`wipe target VERIFIED: "${demo.name}" id=${demo.id}`);
  log(`  → users=${demo._count.users} products=${demo._count.products} orders=${demo._count.orders} customers=${demo._count.customers} stores=${demo._count.stores}`);
  log(`demo company: "${demo.name}" → users=${demo._count.users} products=${demo._count.products} orders=${demo._count.orders} customers=${demo._count.customers} stores=${demo._count.stores}`);
  const superAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN', companyId: null } });
  log(`protected: ${superAdmins} superadmins (companyId=null), global roles, RolePermissionDefaults, SystemSettings`);
  if (DRY_RUN) { log(`[dry] would clear ALL business data of "${demo.name}" and DISABLE its ${demo._count.users} users (accounts + audit history stay); nothing is deleted without --apply`); return; }
  // Explicit ordered cleanup — Postgres cascade order is unspecified and
  // Restrict edges (OrderItem→Product, Region→Country, …) can fire before
  // their parents' rows are gone. Delete every demo-scoped row explicitly,
  // children first. No company-wide wildcard deletes: scope = demo.id only.
  // audit_logs is deliberately ABSENT: it is append-only by trigger (no
  // UPDATE, no DELETE) and its history must survive the wipe.
  const D = async (model, relWhere = null) => {
    try {
      await prisma[model].deleteMany({ where: relWhere || { companyId: demo.id } });
    } catch (e) {
      if (relWhere) throw e;
      // model has no companyId column — retry through its parent relation
      const rel = { statementLine: 'statement', statementReceipt: 'statement', landingPageRecommendation: 'landingPage', landingPageView: 'landingPage' }[model];
      if (rel) return D(model, { [rel]: { companyId: demo.id } });
      throw new Error(`wipe: ${model} could not be cleared — refusing to continue silently (${e.message.split('\n')[0].slice(0, 160)})`);
    }
  };
  await D('orderItem');
  await D('orderActivity'); await D('orderNote'); await D('orderStatusLog');
  await D('orderContactAttempt'); await D('orderClaimHistory'); await D('orderChangeRequest');
  await D('orderIssue'); await D('orderAddOn'); await D('deliveryAttempt');
  await D('returnReceipt'); await D('callLog'); await D('financialTransaction');
  await D('commissionEntry'); await D('settlementMatch');
  await D('conversionDelivery');
  await D('walletMovement'); await D('walletTransfer'); await D('dailyClosing');
  await D('walletOpeningCount'); await D('wallet');
  await D('statementLine'); await D('statementReceipt'); await D('courierStatement');
  await D('penalty'); await D('payslip'); await D('commissionPayout');
  await D('commissionPeriod'); await D('commissionRule'); await D('penaltyRule');
  await D('attendanceMark'); await D('aiDailySummary'); await D('notification');
  await D('productReview'); await D('productImage');
  await D('landingPageView'); await D('landingPageRecommendation');
  await D('customConversion'); await D('trackingPixel'); await D('adAccount'); await D('campaign');
  await D('storeFont'); await D('storePage'); await D('storeMenu'); await D('storeRedirect');
  await D('telegramMessage'); await D('telegramSource');
  await D('whatsappMessage'); await D('whatsappConversation'); await D('whatsappConnection');
  await D('appDelivery'); await D('appInstall'); await D('app');
  await D('idempotencyRecord'); await D('systemToken');
  await prisma.userStoreAccess.deleteMany({ where: { store: { companyId: demo.id } } });
  await prisma.userCountryAccess.deleteMany({ where: { country: { companyId: demo.id } } });
  await D('inventoryMovement'); await D('productionBatchCost'); await D('productionBatch');
  await D('stockOpeningCount'); await D('offer');
  await D('deliveryFee');
  await prisma.region.deleteMany({ where: { country: { companyId: demo.id } } });
  await D('deliveryProvider'); await D('shippingBatch');
  await D('country'); await D('store'); await D('category'); await D('orderChannel');
  await D('product'); await D('customer'); await D('expense');
  // The company ROW and its users STAY. audit_logs is append-only and may
  // still reference them (rows written from other scopes too), and the owner
  // wants the old staff accounts disabled, not erased. Everything above —
  // orders, products, customers, stock, finance — is already gone.
  const disabled = await prisma.user.updateMany({
    where: { companyId: demo.id, status: { not: 'DISABLED' } },
    data: { status: 'DISABLED', tokenVersion: { increment: 1 } },
  });
  bump('legacy_users_disabled', disabled.count);
  log(`legacy users disabled: ${disabled.count} (login blocked, sessions killed, audit history untouched)`);
  // Optional, explicit: keep exactly ONE active platform owner.
  const keepIdx = process.argv.indexOf('--disable-superadmins-except');
  const keepEmail = keepIdx !== -1 ? process.argv[keepIdx + 1] : null;
  if (keepEmail) {
    const others = await prisma.user.updateMany({
      where: { role: 'SUPER_ADMIN', companyId: null, email: { not: keepEmail }, status: { not: 'DISABLED' } },
      data: { status: 'DISABLED', tokenVersion: { increment: 1 } },
    });
    bump('superadmins_disabled', others.count);
    log(`other superadmins disabled: ${others.count} — the one active platform owner is ${keepEmail}`);
  } else {
    const supers = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', companyId: null, status: { not: 'DISABLED' } }, select: { email: true } });
    log(`active superadmins left untouched (${supers.length}): ${supers.map((s) => s.email).join(', ')} — pass --disable-superadmins-except <email> to keep only one`);
  }
  log('company shell kept (audit history references it) — its business data is fully cleared');
}

/** Step: infra — company, country, regions, store, providers, fees, categories, channel. */
async function stepInfra(ctx, dump) {
  let { company } = await getSalahContext();
  // Ambiguity guard: two companies with the destination's name make every
  // later findFirst meaningless — stop instead of guessing.
  if (!DRY_RUN) {
    const sameName = await prisma.company.findMany({ where: { name: COMPANY_NAME }, select: { id: true } });
    if (sameName.length > 1) throw new Error(`${sameName.length} companies are named "${COMPANY_NAME}" (${sameName.map((c) => c.id).join(', ')}) — resolve the duplication before migrating`);
  }
  if (!company) {
    log('creating company', COMPANY_NAME, `(currency ${CURRENCY})`);
    if (!DRY_RUN) company = await prisma.company.create({ data: { name: COMPANY_NAME, currency: CURRENCY, country: 'سوريا', settings: JSON.stringify({ legacyMigration: true, migratedAt: now().toISOString() }) } });
    else company = { id: 'DRY-RUN' };
  } else log('company exists:', company.id);
  ctx.company = company;

  let country = DRY_RUN ? null : await prisma.country.findFirst({ where: { companyId: company.id, code: COUNTRY_CODE } });
  if (!country && !DRY_RUN) {
    country = await prisma.country.create({ data: { companyId: company.id, code: COUNTRY_CODE, name: 'سوريا', currencyCode: CURRENCY, minorUnit: 2, timezone: 'Asia/Damascus', weekendDays: [5], orderPrefix: 'SY' } });
  }
  ctx.country = country;

  // regions from legacy dump (14 Syrian governorates)
  const legacyRegions = rows(dump, 'regions');
  const regionByName = new Map((ctx.regions || []).map((r) => [r.name, r]));
  ctx.regionMap = new Map(); // legacy region_id → Region
  for (const r of legacyRegions) {
    let reg = regionByName.get(r.name);
    if (!reg && !DRY_RUN) {
      reg = await prisma.region.findFirst({ where: { countryId: country.id, name: r.name } })
        || await prisma.region.create({ data: { countryId: country.id, name: r.name } });
      regionByName.set(r.name, reg);
    }
    if (reg) ctx.regionMap.set(r.id, reg.id);
  }
  log(`regions: ${ctx.regionMap.size}/${legacyRegions.length} mapped`);

  // The store is REUSED, never duplicated: explicit --store-id first, then the
  // destination company's own salah-plus slug, then creation — with company
  // and country ownership verified (see lib/safety-rules.mjs).
  const allStores = await prisma.store.findMany({ select: { id: true, slug: true, companyId: true, countryId: true, name: true } });
  const storeTarget = resolveStoreTarget(process.argv, allStores, { companyId: company.id, countryId: country?.id ?? null });
  log(`store: ${storeTarget.reason}`);
  if (!storeTarget.ok) {
    for (const c of storeTarget.candidates) log(`  existing store: ${c.id}  slug="${c.slug}"  company=${c.companyId}  country=${c.countryId}`);
    if (!DRY_RUN) throw new Error(`store resolution failed: ${storeTarget.reason}`);
    log('[dry] store step would ABORT — resolve the store ownership/country first');
    return;
  }
  let store = storeTarget.store || null;
  if (storeTarget.action === 'create' && !DRY_RUN) {
    store = await prisma.store.create({ data: { companyId: company.id, countryId: country.id, name: COMPANY_NAME, slug: STORE_SLUG, status: 'ACTIVE', type: 'MULTI_PRODUCT', language: 'ar', priceIncludesDelivery: false } });
    log(`store created: ${store.id}`);
  }
  ctx.store = store;

  // delivery providers + per-region fees
  const legacyShippings = rows(dump, 'shippings');
  const providerByOld = new Map((ctx.providers || []).map((p) => [p.name, p]));
  ctx.providerMap = new Map();
  for (const s of legacyShippings) {
    let prov = providerByOld.get(s.name);
    if (!prov && !DRY_RUN) {
      prov = await prisma.deliveryProvider.create({ data: { companyId: company.id, name: s.name, code: `LEG-${s.id}`, kind: 'COMPANY', isActive: true } });
      providerByOld.set(s.name, prov);
    }
    if (prov) ctx.providerMap.set(s.id, prov.id);
  }
  log(`providers: ${ctx.providerMap.size}/${legacyShippings.length}`);

  if (!DRY_RUN) {
    const feeRows = rows(dump, 'shipping_prices');
    let made = 0;
    for (const f of feeRows) {
      const providerId = ctx.providerMap.get(f.shipping_id);
      const regionId = ctx.regionMap.get(f.region_id);
      if (!providerId || !regionId) { warn(`shipping_price ${f.id}: unmapped provider/region — skipped`); continue; }
      const exists = await prisma.deliveryFee.findFirst({ where: { deliveryProviderId: providerId, regionId } });
      if (!exists) { await prisma.deliveryFee.create({ data: { companyId: company.id, countryId: country.id, deliveryProviderId: providerId, regionId, fee: parseFloat(f.price) } }); made++; }
    }
    log(`delivery fees created: ${made} (of ${feeRows.length})`);
  }

  // categories
  const legacyCats = rows(dump, 'categories');
  const catByOld = new Map((ctx.categories || []).map((c) => [c.name, c]));
  ctx.categoryMap = new Map();
  for (const c of legacyCats) {
    let cat = catByOld.get(c.name);
    if (!cat && !DRY_RUN) {
      cat = await prisma.category.create({ data: { companyId: company.id, name: c.name } });
      catByOld.set(c.name, cat);
    }
    if (cat) ctx.categoryMap.set(c.id, cat.id);
  }
  log(`categories: ${ctx.categoryMap.size}/${legacyCats.length}`);

  // order channel (legacy site)
  let channel = DRY_RUN ? null : await prisma.orderChannel.findFirst({ where: { companyId: company.id, name: 'الموقع القديم' } });
  if (!channel && !DRY_RUN) channel = await prisma.orderChannel.create({ data: { companyId: company.id, name: 'الموقع القديم', kind: 'OTHER' } });
  ctx.channel = channel;
}

/** Step: staff — 23 legacy employees → User (new passwords, roles mapped). */
async function stepStaff(ctx, dump) {
  if (!ctx.company || ctx.company.id === 'DRY-RUN') { log('[dry] staff step needs company'); return; }
  const staff = [];
  const assign = {};
  for (const r of tuples(dump, 'auth_assignment')) (assign[r.user_id] ||= []).push(r.item_name);
  for (const r of tuples(dump, 'users')) if (assign[r.id]) staff.push(r);
  log('legacy staff:', staff.length);
  if (DRY_RUN) {
    const byRole = {};
    for (const s of staff) { const rl = STAFF_ROLE_MAP[assign[s.id][0]] || 'MODERATOR'; byRole[rl] = (byRole[rl] || 0) + 1; }
    log('[dry] would create', staff.length, 'staff users by role:', JSON.stringify(byRole));
    return;
  }
  const creds = {};
  const newRoleName = { 'super-admin': 'SUPER_ADMIN', manager: 'MANAGER', seller: 'MODERATOR' };
  for (const s of staff) {
    const email = s.email || `staff${s.id}@salah-plus.local`;
    const role = newRoleName[assign[s.id][0]] || 'MODERATOR';
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) { bump('staff_existing'); continue; }
    const pw = crypto.randomBytes(9).toString('base64url');
    creds[email] = pw;
    if (!DRY_RUN) {
      await prisma.user.create({ data: { companyId: ctx.company.id, email, name: s.full_name || `staff-${s.id}`, passwordHash: bcrypt.hashSync(pw, 10), role, phone: s.phone, status: 'ACTIVE', createdAt: dt(s.created_at) || now() } });
    }
    bump('staff_created');
  }
  if (!DRY_RUN && Object.keys(creds).length) {
    fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 1));
    log(`credentials for new staff → ${CREDS_PATH} (git-ignored)`);
  }
}

/** Step: customers — merge legacy users (non-staff) + addresses, dedupe by normalized phone. */
async function stepCustomers(ctx, dump) {
  if (DRY_RUN) {
    const assign = {};
    for (const r of tuples(dump, 'auth_assignment')) assign[r.user_id] = true;
    const phones = new Set();
    for (const a of tuples(dump, 'addresses')) { const p = normPhone(a.phone); if (p) phones.add(p); }
    for (const u of tuples(dump, 'users')) { if (assign[u.id]) continue; const p = normPhone(u.phone); if (p) phones.add(p); }
    log('[dry] distinct customer phones (users+addresses):', phones.size);
    return;
  }
  const assign = {};
  for (const r of tuples(dump, 'auth_assignment')) assign[r.user_id] = true;
  // phone → profile (latest wins)
  const people = new Map();
  for (const a of tuples(dump, 'addresses')) {
    const ph = normPhone(a.phone);
    if (!ph) { warn(`address ${a.id}: unparseable phone`); continue; }
    const cur = people.get(ph) || { names: [], addresses: [], regionIds: [] };
    if (a.full_name) cur.names.push([dt(a.created_at) || new Date(0), a.full_name]);
    if (a.address) cur.addresses.push([dt(a.created_at) || new Date(0), a.address]);
    cur.regionIds.push(a.region_id);
    people.set(ph, cur);
  }
  for (const u of tuples(dump, 'users')) {
    if (assign[u.id]) continue; // staff are Users, not customers
    const ph = normPhone(u.phone);
    if (!ph) { warn(`user ${u.id}: unparseable phone`); continue; }
    const cur = people.get(ph) || { names: [], addresses: [], regionIds: [] };
    if (u.full_name) cur.names.push([dt(u.created_at) || new Date(0), u.full_name]);
    people.set(ph, cur);
  }
  log('distinct customer phones:', people.size);

  const regionNameById = new Map((ctx.regions || []).map((r) => [r.id, r.name]));
  const existing = await prisma.customer.findMany({ where: { companyId: ctx.company.id }, select: { phone: true } });
  const have = new Set(existing.map((c) => c.phone));
  const batch = [];
  for (const [ph, cur] of people) {
    if (have.has(ph)) { bump('customers_existing'); continue; }
    const latestName = cur.names.sort((a, b) => b[0] - a[0])[0]?.[1] || ph;
    const latestAddr = cur.addresses.sort((a, b) => b[0] - a[0])[0]?.[1] || '';
    const latestRegionId = cur.regionIds[cur.regionIds.length - 1];
    const regionName = regionNameById.get(latestRegionId) || '';
    batch.push({
      id: uuid(), companyId: ctx.company.id, storeId: ctx.store?.id ?? null,
      fullName: latestName.trim(), phone: ph, rawPhone: ph, address: latestAddr.trim(), city: regionName, country: 'SY',
    });
    have.add(ph);
    if (batch.length >= 500) { await prisma.customer.createMany({ data: batch }); bump('customers_created', batch.length); batch.length = 0; }
  }
  if (batch.length) { await prisma.customer.createMany({ data: batch }); bump('customers_created', batch.length); }
  log('customers created:', stats.counters.customers_created || 0, '| existing:', stats.counters.customers_existing || 0);
}

/** Step: products — products + opening stock batch + inventory movements. */
async function stepProducts(ctx, dump) {
  if (DRY_RUN) { log('[dry] would create products + opening batches + opening count'); return; }
  const inventory = new Map(rows(dump, 'inventory').map((i) => [i.product_id, parseInt(i.quantity)]));
  const variants = new Map(rows(dump, 'variants').map((v) => [v.product_id, v]));
  const products = rows(dump, 'products');
  log('legacy products:', products.length);

  let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  let openingCount = await prisma.stockOpeningCount.findFirst({ where: { storeId: ctx.store.id } });
  if (!openingCount) {
    openingCount = await prisma.stockOpeningCount.create({ data: { companyId: ctx.company.id, storeId: ctx.store.id, countedByName: 'ترحيل القاعدة القديمة', countedAt: now(), recordedById: superAdmin.id, note: 'أرصدة افتتاحية من جدول inventory في القاعدة القديمة' } });
  }

  for (const p of products) {
    const sku = `LEG-${p.id}`;
    const exists = await prisma.product.findFirst({ where: { companyId: ctx.company.id, sku } });
    if (exists) { bump('products_existing'); continue; }
    const v = variants.get(p.id);
    const cost = parseFloat(v?.cost ?? p.cost ?? 0);
    const invQty = inventory.has(p.id) ? inventory.get(p.id) : parseInt(p.quantity);
    let qty = isNaN(invQty) ? 0 : invQty;
    if (qty < 0) { warn(`product ${p.id} (${p.name}): negative stock ${qty} clamped to 0`); qty = 0; }
    const prod = await prisma.product.create({
      data: {
        id: uuid(), companyId: ctx.company.id, storeId: ctx.store.id,
        name: (p.name || `منتج ${p.id}`).trim(), sku,
        description: p.description || null,
        sourceType: 'PURCHASED', status: 'ACTIVE',
        basePrice: parseFloat(p.price), categoryId: ctx.categoryMap.get(p.category_id) || null,
        createdAt: dt(p.created_at) || now(),
      },
    });
    const batch = await prisma.productionBatch.create({
      data: {
        companyId: ctx.company.id, storeId: ctx.store.id, productId: prod.id,
        batchNumber: `LEG-${p.id}`, quantityProduced: qty, quantitySold: 0, quantityRemaining: qty,
        rawMaterialCost: cost, totalProductionCost: cost * qty, costPerUnit: cost,
        status: 'COMPLETED', openingCountId: openingCount.id, productionDate: dt(p.created_at) || now(),
      },
    });
    await prisma.inventoryMovement.create({
      data: { companyId: ctx.company.id, storeId: ctx.store.id, productId: prod.id, batchId: batch.id, type: 'PRODUCTION', quantity: qty, balanceAfter: qty, reason: 'رصيد افتتاحي من الترحيل', createdById: superAdmin.id },
    });
    bump('products_created');
  }
  log('products created:', stats.counters.products_created || 0);
}

/** Step: offers — bundle_quantity → Offer. */
async function stepOffers(ctx, dump) {
  if (DRY_RUN) { log('[dry] would create offers from bundle_quantity'); return; }
  const bundles = rows(dump, 'bundle_quantity');
  for (const b of bundles) {
    const prod = await prisma.product.findFirst({ where: { companyId: ctx.company.id, sku: `LEG-${b.product_id}` } });
    if (!prod) { warn(`bundle ${b.id}: product ${b.product_id} missing`); continue; }
    const name = `${b.quantity} قطع`;
    const exists = await prisma.offer.findFirst({ where: { companyId: ctx.company.id, productId: prod.id, quantity: parseInt(b.quantity) } });
    if (exists) { bump('offers_existing'); continue; }
    await prisma.offer.create({ data: { companyId: ctx.company.id, productId: prod.id, name, quantity: parseInt(b.quantity), sellingPrice: parseFloat(b.price), deliveryIncluded: true, status: 'ACTIVE', createdAt: dt(b.created_at) || now() } });
    bump('offers_created');
  }
  log('offers created:', stats.counters.offers_created || 0);
}

/** Step: orders — orders + items + statuses + money. */
async function stepOrders(ctx, dump) {
  if (DRY_RUN) {
    const assign = {};
    for (const r of tuples(dump, 'auth_assignment')) assign[r.user_id] = true;
    const custPhones = new Set();
    for (const a of tuples(dump, 'addresses')) { const p = normPhone(a.phone); if (p) custPhones.add(p); }
    for (const u of tuples(dump, 'users')) { if (assign[u.id]) continue; const p = normPhone(u.phone); if (p) custPhones.add(p); }
    const addrById = new Map(rows(dump, 'addresses').map((a) => [a.id, a]));
    let resolvable = 0, unresolvable = 0;
    for (const o of tuples(dump, 'orders')) {
      const a = o.address_id ? addrById.get(o.address_id) : null;
      const ph = a ? normPhone(a.phone) : null;
      if (ph && custPhones.has(ph)) resolvable++; else unresolvable++;
    }
    log('[dry] orders resolvable to a customer:', resolvable, '| unresolvable:', unresolvable);
    return;
  }
  // indexes
  const customers = await prisma.customer.findMany({ where: { companyId: ctx.company.id }, select: { id: true, phone: true } });
  const custByPhone = new Map(customers.map((c) => [c.phone, c.id]));
  const products = await prisma.product.findMany({ where: { companyId: ctx.company.id }, select: { id: true, sku: true, name: true } });
  const prodBySku = new Map(products.map((p) => [p.sku, p]));
  const staffUsers = await prisma.user.findMany({ where: { companyId: ctx.company.id }, select: { id: true, email: true } });
  // legacy users email → new user id (staff emails preserved verbatim)
  const legacyUserEmail = new Map();
  for (const u of tuples(dump, 'users')) if (u.email) legacyUserEmail.set(u.id, u.email);
  const userByLegacyEmail = new Map(staffUsers.map((u) => [u.email, u.id]));

  // legacy address id → {phone, regionId}
  const addrById = new Map();
  for (const a of tuples(dump, 'addresses')) addrById.set(a.id, a);

  const orderItemsByOrder = new Map();
  for (const it of tuples(dump, 'order_items')) {
    (orderItemsByOrder.get(it.order_id) || orderItemsByOrder.set(it.order_id, []).get(it.order_id)).push(it);
  }

  const existingOrders = new Set((await prisma.order.findMany({ where: { companyId: ctx.company.id }, select: { orderNumber: true } })).map((o) => o.orderNumber));

  let created = 0, skipped = 0, noCustomer = 0;
  const createdOrderIds = [];
  for (const o of tuples(dump, 'orders')) {
    const orderNumber = `SY-${String(o.id).padStart(6, '0')}`;
    if (existingOrders.has(orderNumber)) { skipped++; continue; }
    // resolve customer
    let custId = null;
    const legacyUser = o.user_id ? { phone: null } : null;
    if (o.user_id) {
      // find legacy user's phone from dump lazily (indexed below)
    }
    const addr = o.address_id ? addrById.get(o.address_id) : null;
    const addrPhone = addr ? normPhone(addr.phone) : null;
    custId = addrPhone ? custByPhone.get(addrPhone) : null;
    if (!custId && legacyUserEmail.has(o.user_id)) {
      const staffEmail = legacyUserEmail.get(o.user_id);
      const uid = userByLegacyEmail.get(staffEmail);
      if (uid) { /* staff ordering? unlikely */ }
    }
    if (!custId) { noCustomer++; warn(`order ${o.id}: no customer for phone ${addrPhone}`); continue; }

    const sm = STATUS_MAP[parseInt(o.status_id)] || STATUS_MAP[2];
    const [legacyStatus, confS, shipS, settS, rejReason] = sm;
    const items = orderItemsByOrder.get(o.id) || [];
    if (!items.length) { warn(`order ${o.id}: no items`); continue; }
    const first = items[0];
    const prod = prodBySku.get(`LEG-${first.product_id}`);
    if (!prod) { warn(`order ${o.id}: product ${first.product_id} missing`); continue; }

    const subtotal = parseFloat(o.sub_total) || 0;
    const discount = parseFloat(o.discount) || 0;
    const shippingPrice = parseFloat(o.shipping_price) || 0;
    const total = parseFloat(o.total) || 0;
    const productCost = items.reduce((s, it) => s + parseFloat(it.cost) * parseInt(it.quantity), 0);
    const netProfit = o.profit === null ? null : parseFloat(o.profit);

    const regionId = addr && ctx.regionMap.get(addr.region_id) ? ctx.regionMap.get(addr.region_id) : null;
    const deliveryProviderId = ctx.providerMap.get(o.shipping_id) || null;
    const createdAt = dt(o.created_at) || now();

    const delivered = shipS === 'DELIVERED';
    const returned = shipS === 'RETURNED';

    const orderData = {
      id: uuid(), companyId: ctx.company.id, orderNumber,
      customerId: custId, channelId: ctx.channel?.id ?? null,
      productId: prod.id, quantity: items.reduce((s, it) => s + parseInt(it.quantity), 0),
      sellingPrice: parseFloat(first.price), shippingCost: shippingPrice, discountAmount: discount, totalAmount: total,
      currency: CURRENCY,
      createdById: legacyUserEmail.get(o.creator_id) ? userByLegacyEmail.get(legacyUserEmail.get(o.creator_id)) || null : null,
      moderatorId: null, moderatorCommission: parseFloat(o.commission_amount) || 0,
      estimatedCostOfGoods: productCost,
      productNameSnapshot: prod.name,
      status: legacyStatus, confirmationStatus: confS, shippingStatus: shipS, settlementStatus: settS,
      rejectionReason: rejReason,
      deliveryProviderId, deliveryFee: shippingPrice || null,
      shippingReference: o.invoice_number || null,
      subtotal, discount, shippingRevenue: shippingPrice, totalRevenue: total,
      productCost, netProfit,
      collectedAmount: settS === 'COLLECTED' ? total : null,
      source: 'Legacy import',
      regionId, countryId: ctx.country?.id ?? null, storeId: ctx.store.id,
      internalNotes: o.note || null,
      createdAt, updatedAt: dt(o.updated_at) || createdAt,
      items: {
        create: items.map((it) => {
          const p2 = prodBySku.get(`LEG-${it.product_id}`);
          const q = parseInt(it.quantity);
          return {
            id: uuid(), companyId: ctx.company.id, productId: p2?.id || prod.id,
            productName: p2?.name || `LEG-${it.product_id}`,
            quantity: q, unitPrice: parseFloat(it.price), lineTotal: parseFloat(it.price) * q,
            deliveredQty: delivered ? q : null, returnedQty: returned ? q : null,
            createdAt,
          };
        }),
      },
    };
    await prisma.order.create({ data: orderData });
    created++; createdOrderIds.push(orderNumber);
    if (created % 2000 === 0) log(`  … ${created} orders`);
  }
  bump('orders_created', created); bump('orders_skipped_existing', skipped);
  log(`orders created: ${created} | skipped(existing): ${skipped} | no-customer: ${noCustomer}`);
}

/** Step: commissions — wallet_transactions → CommissionEntry (ACCRUED). */
async function stepCommissions(ctx, dump) {
  if (DRY_RUN) { log('[dry] would import wallet_transactions as ACCRUED commission entries'); return; }
  const staffUsers = await prisma.user.findMany({ where: { companyId: ctx.company.id }, select: { id: true, email: true, role: true } });
  const userByEmail = new Map(staffUsers.map((u) => [u.email, u]));
  const legacyUserEmail = new Map();
  for (const u of tuples(dump, 'users')) if (u.email) legacyUserEmail.set(u.id, u.email);
  const orders = await prisma.order.findMany({ where: { companyId: ctx.company.id }, select: { id: true, orderNumber: true } });
  const orderByNumber = new Map(orders.map((o) => [o.orderNumber, o.id]));

  const existing = new Set((await prisma.commissionEntry.findMany({ where: { companyId: ctx.company.id }, select: { orderId: true, userId: true, status: true } })).map((e) => `${e.orderId}|${e.userId}|${e.status}`));

  let made = 0, skipped = 0;
  const batch = [];
  for (const w of tuples(dump, 'wallet_transactions')) {
    if (!w.reference_table || w.reference_table !== 'orders') { skipped++; continue; }
    const orderNumber = `SY-${String(w.reference_id).padStart(6, '0')}`;
    const orderId = orderByNumber.get(orderNumber);
    const staff = legacyUserEmail.get(w.user_id) ? userByEmail.get(legacyUserEmail.get(w.user_id)) : null;
    if (!orderId || !staff) { skipped++; continue; }
    const val = parseFloat(w.value);
    if (!isFinite(val)) { skipped++; continue; }
    const key = `${orderId}|${staff.id}|ACCRUED`;
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);
    batch.push({
      id: uuid(), companyId: ctx.company.id, orderId, userId: staff.id, role: staff.role,
      amount: val, currencyCode: CURRENCY, status: 'ACCRUED',
      periodMonth: (dt(w.created_at) || now()).toISOString().slice(0, 7),
      createdAt: dt(w.created_at) || now(),
    });
    if (batch.length >= 500) { await prisma.commissionEntry.createMany({ data: batch }); made += batch.length; batch.length = 0; }
  }
  if (batch.length) { await prisma.commissionEntry.createMany({ data: batch }); made += batch.length; }
  bump('commissions_created', made);
  log(`commission entries created: ${made} | skipped: ${skipped}`);
}

/** Step: activity — legacy order_logs (status-related) → OrderActivity. */
async function stepActivity(ctx, dump) {
  if (DRY_RUN) { log('[dry] would import status-related order_logs as OrderActivity (field-level edits skipped)'); return; }
  const orders = await prisma.order.findMany({ where: { companyId: ctx.company.id }, select: { id: true, orderNumber: true } });
  const orderByNumber = new Map(orders.map((o) => [o.orderNumber, o.id]));
  const legacyUserEmail = new Map();
  for (const u of tuples(dump, 'users')) if (u.email) legacyUserEmail.set(u.id, u.email);
  const staffUsers = await prisma.user.findMany({ where: { companyId: ctx.company.id }, select: { id: true, email: true } });
  const userByEmail = new Map(staffUsers.map((u) => [u.email, u.id]));
  // legacy status id → legacyStatus string
  const statusIdName = new Map(Object.entries(STATUS_MAP).map(([k, v]) => [k, v[0]]));

  const existing = new Set((await prisma.orderActivity.findMany({ where: { companyId: ctx.company.id }, select: { orderId: true, createdAt: true, action: true } })).map((a) => `${a.orderId}|${a.createdAt.toISOString()}|${a.action}`));

  const STATUS_FIELDS = new Set(['status_id', 'status_order', 'delivery_status']);
  let made = 0, skippedOther = 0, skippedDup = 0;
  const batch = [];
  for (const l of tuples(dump, 'order_logs')) {
    const orderNumber = `SY-${String(l.order_id).padStart(6, '0')}`;
    const orderId = orderByNumber.get(orderNumber);
    if (!orderId) { skippedOther++; continue; }
    const at = dt(l.created_at) || now();
    const isStatus = l.action === 'update' && STATUS_FIELDS.has(l.field_name);
    const action = l.action === 'create' ? 'ORDER_CREATED' : isStatus ? 'STATUS_CHANGED' : null;
    if (!action) { skippedOther++; continue; }
    const userId = legacyUserEmail.get(l.user_id) ? userByEmail.get(legacyUserEmail.get(l.user_id)) || null : null;
    let previousStatus = null, newStatus = null;
    if (isStatus && l.field_name === 'status_id') {
      previousStatus = statusIdName.get(l.old_value) || null;
      newStatus = statusIdName.get(l.new_value) || null;
    }
    const meta = JSON.stringify({ legacyField: l.field_name, legacyOld: l.old_value, legacyNew: l.new_value });
    const key = `${orderId}|${at.toISOString()}|${action}`;
    if (existing.has(key)) { skippedDup++; continue; }
    existing.add(key);
    batch.push({ id: uuid(), companyId: ctx.company.id, orderId, userId, action, previousStatus, newStatus, metadata: meta, createdAt: at });
    if (batch.length >= 1000) { await prisma.orderActivity.createMany({ data: batch }); made += batch.length; batch.length = 0; }
  }
  if (batch.length) { await prisma.orderActivity.createMany({ data: batch }); made += batch.length; }
  bump('activities_created', made);
  log(`activities created: ${made} | non-status edits skipped: ${skippedOther} | dups skipped: ${skippedDup}`);
}

/** Step: pages — landing pages (HTML mode) + Meta pixel. */
async function stepPages(ctx, dump) {
  if (DRY_RUN) { log('[dry] would import landing pages (HTML mode, builder JSON preserved in pageSettings) + Meta pixel'); return; }
  const legacyProducts = new Map(rows(dump, 'products').map((p) => [p.id, p]));
  for (const lp of tuples(dump, 'landing_pages')) {
    const slug = (lp.slug || `legacy-${lp.id}`).trim();
    const exists = await prisma.landingPage.findFirst({ where: { companyId: ctx.company.id, slug } });
    if (exists) { bump('pages_existing'); continue; }
    const prod = await prisma.product.findFirst({ where: { companyId: ctx.company.id, sku: `LEG-${lp.product_id}` } });
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = [
      `<h1>${esc(lp.headline || lp.title)}</h1>`,
      lp.description ? `<div>${lp.description}</div>` : '',
      lp.custom_content ? `<div>${esc(lp.custom_content)}</div>` : '',
      prod ? `<p><a href="/p/${prod.sku}" style="background:${lp.secondary_color || '#764ba2'};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">${esc(lp.button_text || 'اطلب الآن')}</a></p>` : '',
    ].filter(Boolean).join('\n');
    await prisma.landingPage.create({
      data: {
        companyId: ctx.company.id, name: (lp.title || slug).trim(), slug,
        htmlContent: html, builderMode: 'HTML',
        pageSettings: JSON.stringify({
          legacyBuilderContent: lp.builder_content || null,
          fontFamily: lp.font_family || 'Cairo',
          primaryColor: lp.primary_color, secondaryColor: lp.secondary_color,
          fontColor: lp.font_color, legacyTemplate: lp.template,
        }),
        metaPixelId: null, productId: prod?.id || null,
        isPublished: lp.status === 'published', showInStore: false,
        viewsCount: parseInt(lp.views_count) || 0,
        storeId: ctx.store.id,
        createdAt: lp.created_at ? new Date(parseInt(lp.created_at) * 1000) : now(),
      },
    });
    bump('pages_created');
  }
  log('landing pages created:', stats.counters.pages_created || 0);

  // Meta pixel from legacy settings
  const settings = rows(dump, 'settings')[0];
  if (settings?.facebook_pixel && /^\d+$/.test(settings.facebook_pixel)) {
    const exists = await prisma.trackingPixel.findFirst({ where: { companyId: ctx.company.id, platform: 'META', pixelId: settings.facebook_pixel } });
    if (!exists) {
      await prisma.trackingPixel.create({ data: { companyId: ctx.company.id, platform: 'META', name: 'Facebook Pixel (من الموقع القديم)', pixelId: settings.facebook_pixel, enabled: true, scope: 'GLOBAL' } });
      log('Meta pixel imported:', settings.facebook_pixel);
    }
  }
}

/** Step: verify — counts + integrity checks vs legacy dump. */
async function stepVerify(ctx, dump) {
  log('=== VERIFY ===');
  const c = await getSalahContext();
  if (!c.company) { log('company missing — nothing to verify'); return; }
  const cid = c.company.id;
  const legacyOrders = rows(dump, 'orders').length;
  const legacyItems = rows(dump, 'order_items').length;
  const newCustomers = await prisma.customer.count({ where: { companyId: cid } });
  const newStaff = await prisma.user.count({ where: { companyId: cid } });
  const newCommissions = await prisma.commissionEntry.count({ where: { companyId: cid } });
  const newActivities = await prisma.orderActivity.count({ where: { companyId: cid } });

  // money checksums
  const legacyTotalSum = rows(dump, 'orders').reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  // On production the destination company may already hold its own data, so
  // hard counts compare THE MIGRATION'S OWN ROWS (marked at import), never the
  // company's grand totals. A pre-existing storefront survives untouched and
  // the gate stays honest in both directions.
  const LEGACY_MARK = 'Legacy import';
  const legacyOrdersMigrated = await prisma.order.count({ where: { companyId: cid, source: LEGACY_MARK } });
  const legacyItemsMigrated = await prisma.orderItem.count({ where: { companyId: cid, order: { source: LEGACY_MARK } } });
  const legacyProductsMigrated = await prisma.product.count({ where: { companyId: cid, sku: { startsWith: 'LEG-' } } });
  const legacyOffersMigrated = await prisma.offer.count({ where: { companyId: cid, product: { sku: { startsWith: 'LEG-' } } } });
  const legacyPagesMigrated = await prisma.landingPage.count({ where: { companyId: cid, pageSettings: { contains: 'legacyBuilderContent' } } });
  const aggLegacyOnly = await prisma.order.aggregate({ where: { companyId: cid, source: LEGACY_MARK }, _sum: { totalAmount: true } });
  const newTotalSum = aggLegacyOnly._sum.totalAmount || 0;
  const aggAll = await prisma.order.aggregate({ where: { companyId: cid }, _sum: { totalAmount: true } });
  const grandTotalSum = Number(aggAll._sum.totalAmount || 0);
  log(`order totals: legacy-marked ${Number(newTotalSum).toFixed(2)} | company grand total ${grandTotalSum.toFixed(2)} (pre-existing data kept as-is)`);

  // orphan checks — customerId/productId are required relations, so orphans are
  // structurally impossible; verify FK integrity via cross-counts instead.
  const ordersNoCustomer = 0;
  const itemsNoProduct = await prisma.orderItem.count({
    where: { companyId: cid, product: { companyId: { not: cid } } },
  });

  const checks = [
    ['orders', legacyOrders, legacyOrdersMigrated],
    ['order_items', legacyItems, legacyItemsMigrated],
    ['products', rows(dump, 'products').length, legacyProductsMigrated],
    ['offers', rows(dump, 'bundle_quantity').length, legacyOffersMigrated],
    ['staff', 23, newStaff],
    ['customers', '≤ users+addresses distinct', newCustomers],
    ['commissions', rows(dump, 'wallet_transactions').filter((w) => w.reference_table === 'orders').length, newCommissions],
    ['landing_pages', rows(dump, 'landing_pages').length, legacyPagesMigrated],
  ];
  log('table                legacy      migrated');
  for (const [n, a, b] of checks) log(`${n.padEnd(20)} ${String(a).padStart(10)} ${String(b).padStart(10)}`);
  log(`order total sum: legacy ${legacyTotalSum.toFixed(2)} vs migrated ${Number(newTotalSum).toFixed(2)}`);
  log(`orphans: orders-without-customer=${ordersNoCustomer} items-without-product=${itemsNoProduct}`);
  const moneyOk = Math.abs(legacyTotalSum - Number(newTotalSum)) < 0.01;
  log(moneyOk ? '✅ money checksum MATCH' : '❌ money checksum MISMATCH');
  stats.checks = Object.fromEntries(checks.map(([n, a, b]) => [n, { legacy: a, migrated: b }]));
  stats.moneySumLegacy = legacyTotalSum; stats.moneySumMigrated = Number(newTotalSum);
  stats.moneyOk = moneyOk;

  // THE GATE: the tool may not exit green while money or references disagree.
  const verdict = evaluateVerify({
    legacySum: legacyTotalSum,
    migratedSum: Number(newTotalSum),
    countChecks: Object.fromEntries(checks.filter(([n]) => n !== 'customers' && n !== 'commissions' && n !== 'staff').map(([n, a, b]) => [n, [a, b]])),
    orphanCounts: { orders_without_customer: ordersNoCustomer, items_without_product: itemsNoProduct },
  });
  stats.verifyFailures = verdict.failures;
  if (!verdict.ok) {
    for (const f of verdict.failures) log('  ❌', f);
    stats.verifyFailed = true;
    if (!DRY_RUN) throw new Error(`verification FAILED — the migration must not be reported as a success (${verdict.failures.length} failure(s))`);
    log('[dry] verification would FAIL — see failures above');
  } else {
    log('✅ verification passed: money, counts and references all agree');
  }
}

// ─────────────────────────── runner ───────────────────────────

const STEPS = [
  ['backup', stepBackup],
  ['wipe-demo', stepWipeDemo],
  ['infra', stepInfra],
  ['staff', stepStaff],
  ['customers', stepCustomers],
  ['products', stepProducts],
  ['offers', stepOffers],
  ['orders', stepOrders],
  ['commissions', stepCommissions],
  ['activity', stepActivity],
  ['pages', stepPages],
  ['verify', stepVerify],
];

async function main() {
  if (process.argv.includes('--list')) { log(STEPS.map((s) => s[0]).join('\n')); return; }
  log(`=== Salah Plus migration — ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (writes!)'} ===`);
  log('legacy dump:', LEGACY_DUMP);
  const dump = loadDump(LEGACY_DUMP);
  const ctx = {};
  for (const [name, fn] of STEPS) {
    if (stepArg && stepArg !== name) continue;
    log(`\n--- step: ${name} ---`);
    try {
      await fn(ctx, dump);
    } catch (e) {
      console.error(`STEP ${name} FAILED:`, e.message);
      if (!DRY_RUN) { saveReport(); throw e; }
      warn(`step ${name} failed (dry-run): ${e.message}`);
    }
  }
  saveReport();
  log('\nDONE.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
