import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE CONTRACT SYSTEM 7 READS, AND A VALIDATOR SMALL ENOUGH TO TRUST.
 *
 * `contracts/oms-app-events.v1/` is a verbatim copy of the contract on
 * `MKory18/AIresponse` — a draft-07 schema, one golden body per event, and
 * a real signed delivery. This module reads it so `events.test.ts` can
 * prove the six events this repository emits still fit.
 *
 * ── NOT APPLICATION CODE ──
 *
 * Nothing ships this. It exists for the guards, the same arrangement
 * `guard-source.ts` has, and it reads from the filesystem for the same
 * reason: a contract compiled into the bundle is a contract that stops
 * being the file on disk.
 *
 * ── WHY A SUBSET VALIDATOR AND NOT A LIBRARY ──
 *
 * Adding a JSON-Schema dependency to prove a nine-file contract is a new
 * supply-chain edge for one test file. The subset below covers exactly what
 * this schema uses — `type`, `required`, `properties`, `additionalProperties`,
 * `enum`, `pattern`, `anyOf`, `minimum`, `minLength`, `maxLength` — and
 * **refuses a keyword it does not know** rather than ignoring it.
 *
 * That last part is the whole safety of it. A validator that silently skips
 * a keyword it has not implemented reports «valid» about a rule it never
 * checked, which is the shape of every guard in this repository that has
 * ever lied. If `AIresponse` adds `oneOf` tomorrow, this throws and somebody
 * reads the new contract — it does not quietly pass.
 */

const DIR = join(process.cwd(), 'contracts', 'oms-app-events.v1');

export interface SignedDelivery {
  description: string;
  secret: string;
  headers: Record<string, string>;
  body_raw: string;
  signature_example: string;
}

/** One file of the contract, parsed. */
export function readContract<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T;
}

/** Every golden body in the contract, by file name. */
export function goldenBodies(): { name: string; body: unknown }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json' && f !== 'signed-delivery.json')
    .sort()
    .map((name) => ({ name, body: readContract(name) }));
}

type Schema = Record<string, unknown>;

const KNOWN = new Set([
  '$schema', '$id', 'title', 'description', 'examples', 'default',
  'type', 'required', 'properties', 'additionalProperties',
  'enum', 'pattern', 'anyOf', 'minimum', 'maximum', 'minLength', 'maxLength',
  'items', 'format',
]);

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;

/**
 * VALIDATE, RETURNING EVERY REASON IT FAILED.
 *
 * A list and not a boolean: «the body is invalid» sends a reader to diff two
 * JSON files by eye, and «data.total: expected number, got string» does not.
 */
export function validate(schema: Schema, value: unknown, path = ''): string[] {
  const errors: string[] = [];
  const at = path || 'root';

  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) {
      throw new Error(
        `العقد يستعمل كلمة لا يفهمها هذا المتحقّق: «${key}» عند ${at}. ` +
          'اقرأ العقد الجديد على AIresponse ووسّع contract.ts — لا تتجاهلها.'
      );
    }
  }

  if (schema.anyOf) {
    const branches = schema.anyOf as Schema[];
    const all = branches.map((b) => validate(b, value, path));
    if (all.every((e) => e.length > 0)) {
      errors.push(`${at}: لا يطابق أيّاً من ${branches.length} احتمالات`);
    }
    return errors;
  }

  if (schema.type) {
    const want = schema.type as string;
    const got = typeOf(value);
    /*
     * `integer` IS A NUMBER WITH NOTHING AFTER THE POINT.
     *
     * An earlier version of this said «this schema uses "number" only» and
     * returned early on `integer`, so every golden body failed on
     * `quantity`, `items` and `pieces`. The contract uses both — which is
     * exactly why a validator must refuse what it does not know instead of
     * assuming what the other side wrote.
     */
    const ok = want === got || (want === 'integer' && got === 'number' && Number.isInteger(value));
    if (!ok) {
      errors.push(`${at}: متوقَّع ${want} وجاء ${got}`);
      return errors;
    }
  }

  if (schema.enum && !(schema.enum as unknown[]).includes(value)) {
    errors.push(`${at}: «${String(value)}» ليست من القائمة المسموحة`);
  }

  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern as string).test(value)) {
      errors.push(`${at}: لا يطابق النمط ${schema.pattern}`);
    }
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${at}: أقصر من ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${at}: أطول من ${schema.maxLength}`);
    }
  }

  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${at}: أصغر من ${schema.minimum}`);
  }

  if (schema.type === 'object' && value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;

    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in obj)) errors.push(`${at}: الحقل «${key}» مفقود`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`${at}: حقل زائد «${key}» — والغلاف حرفيّ`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) errors.push(...validate(sub, obj[key], path ? `${path}.${key}` : key));
    }
  }

  return errors;
}
