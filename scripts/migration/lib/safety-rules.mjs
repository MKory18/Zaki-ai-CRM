// Pure safety rules for the Salah Plus migration tool — kept free of I/O so
// they can be unit-tested. The CLI wires them to Prisma and argv.

export const MONEY_TOLERANCE = 0.01;

/**
 * Resolve the ONE company whose demo data may be replaced.
 * NEVER guesses: the target must come from an explicit --wipe-company-id
 * flag, must exist, and must not be the migration's own destination company.
 *
 * @param {string[]} argv  process.argv
 * @param {Array<{id:string,name:string,_count?:Record<string,number>}>} companies  every company in the DB
 * @param {string} destinationName  the company the migration CREATES («صحة بلس»)
 * @returns {{ok:boolean, reason:string, company?:{id:string,name:string,_count?:Record<string,number>}, candidates:Array<{id:string,name:string,counts:Record<string,number>|null}>}}
 */
export function resolveWipeTarget(argv, companies, destinationName) {
  const flagIndex = argv.indexOf('--wipe-company-id');
  const wipeId = flagIndex !== -1 ? argv[flagIndex + 1] : undefined;
  const candidates = companies.map((c) => ({ id: c.id, name: c.name, counts: c._count || null }));

  if (!wipeId || wipeId.startsWith('--')) {
    return {
      ok: false,
      reason: 'explicit --wipe-company-id <uuid> is required — the tool never guesses which company to wipe',
      candidates,
    };
  }
  const company = companies.find((c) => c.id === wipeId);
  if (!company) {
    return {
      ok: false,
      reason: `no company with id ${wipeId} — refusing to delete anything`,
      candidates,
    };
  }
  if (company.name === destinationName) {
    return {
      ok: false,
      reason: `company "${company.name}" is the migration's own destination — wiping it is never allowed`,
      candidates,
    };
  }
  return { ok: true, reason: `verified: "${company.name}" (${company.id})`, company, candidates };
}

/**
 * Resolve which store the migration writes into — reusing an existing one
 * instead of creating a second shop inside the same company.
 *
 * Precedence: an explicit --store-id flag, then the destination company's
 * own `salah-plus` slug, then creation. A store found by flag must belong to
 * the destination company AND to the migration's Syria country — a store is
 * not moved across companies here; that is a business decision with its own
 * migration, never a side effect of this one.
 *
 * @param {string[]} argv
 * @param {Array<{id:string,slug:string,companyId:string,countryId:string|null,name?:string}>} stores  every store in the DB
 * @param {{companyId:string, countryId:string|null}} dest  destination company + Syria country ids
 * @returns {{ok:boolean, action:'reuse'|'create', reason:string, store?:{id:string,slug:string,companyId:string,countryId:string|null,name?:string}, candidates:Array<{id:string,slug:string,companyId:string,countryId:string|null,name?:string}>}}
 */
export function resolveStoreTarget(argv, stores, dest) {
  const flagIndex = argv.indexOf('--store-id');
  const storeId = flagIndex !== -1 ? argv[flagIndex + 1] : undefined;
  const slim = (s) => ({ id: s.id, slug: s.slug, companyId: s.companyId, countryId: s.countryId, name: s.name });
  const candidates = stores.map(slim);

  if (storeId && !storeId.startsWith('--')) {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return { ok: false, action: 'reuse', reason: `no store with id ${storeId} — refusing to guess`, candidates };
    if (store.companyId !== dest.companyId) {
      return {
        ok: false,
        action: 'reuse',
        reason: `store "${store.slug || store.id}" belongs to company ${store.companyId}, not the destination ${dest.companyId} — moving a store across companies is a separate migration, not this tool's job`,
        candidates,
      };
    }
    if (store.countryId && dest.countryId && store.countryId !== dest.countryId) {
      return {
        ok: false,
        action: 'reuse',
        reason: `store "${store.slug}" is bound to country ${store.countryId}, but the migration writes Syria (${dest.countryId}) — settle the store's country first`,
        candidates,
      };
    }
    return { ok: true, action: 'reuse', reason: `reusing store "${store.slug}" (${store.id}) in the destination company`, store };
  }

  const bySlug = stores.find((s) => s.slug === 'salah-plus' && s.companyId === dest.companyId);
  if (bySlug) {
    if (bySlug.countryId && dest.countryId && bySlug.countryId !== dest.countryId) {
      return {
        ok: false,
        action: 'reuse',
        reason: `existing store "${bySlug.slug}" (${bySlug.id}) is bound to country ${bySlug.countryId}, but the migration writes Syria (${dest.countryId}) — settle the store's country first`,
        candidates,
      };
    }
    return { ok: true, action: 'reuse', reason: `found the destination company's own "salah-plus" store (${bySlug.id})`, store: bySlug };
  }
  return { ok: true, action: 'create', reason: `no existing store to reuse — "salah-plus" will be created inside the destination company`, candidates };
}

/**
 * The Prisma Client delegate name for a model: `WhatsAppMessage` lives at
 * `prisma.whatsAppMessage` — camelCase, not lowercase. A wrong name reads as
 * `undefined` and a wipe would silently skip a whole table.
 */
export function delegateName(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Which wipe models have no delegate in THIS generated Prisma Client.
 * Empty list = every model can be cleared; anything listed must stop the
 * run instead of being skipped silently.
 * @param {string[]} models  camelCase delegate names
 * @param {object} client    the PrismaClient instance (or any stand-in for tests)
 */
export function missingDelegates(models, client) {
  return models.filter((m) => !client[m] || typeof client[m].deleteMany !== 'function');
}

/**
 * The verify gate. Returns every FAILURE; an empty list means the migration
 * may claim success. Called with legacy vs migrated aggregates.
 *
 * @param {object} p
 * @param {number} p.legacySum        sum of legacy order totals
 * @param {number} p.migratedSum      sum of migrated order totals
 * @param {number} [p.tolerance]
 * @param {Record<string,[number,number]>} [p.countChecks]  name → [legacy, migrated]
 * @param {Record<string,number>} [p.orphanCounts]  name → count of broken FK rows
 */
export function evaluateVerify({ legacySum, migratedSum, tolerance = MONEY_TOLERANCE, countChecks = {}, orphanCounts = {} }) {
  const failures = [];
  const l = Number(legacySum), m = Number(migratedSum);
  if (!isFinite(l) || !isFinite(m)) failures.push('money sums are not finite numbers');
  else if (Math.abs(l - m) > tolerance) {
    failures.push(`money checksum MISMATCH: legacy ${l.toFixed(2)} vs migrated ${m.toFixed(2)}`);
  }
  for (const [name, [legacy, migrated]] of Object.entries(countChecks)) {
    if (legacy !== migrated) failures.push(`count mismatch ${name}: legacy ${legacy} vs migrated ${migrated}`);
  }
  for (const [name, count] of Object.entries(orphanCounts)) {
    if (count > 0) failures.push(`broken references: ${name} = ${count}`);
  }
  return { ok: failures.length === 0, failures };
}
