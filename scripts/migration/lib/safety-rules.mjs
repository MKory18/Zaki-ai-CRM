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
