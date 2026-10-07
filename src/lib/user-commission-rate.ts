import { z } from 'zod';

/**
 * ONE RULE FOR `User.commissionRate` — WRITTEN ONCE, READ BY EVERY DOOR.
 *
 * Two doors wrote this column by two different rules.
 *
 *   · `POST /api/users` validated it — `z.number().min(0).max(50)` — and
 *     wrote 0 when nobody typed one, which is the column's own default.
 *   · `POST /api/moderators` validated nothing and wrote
 *     `parseFloat(commissionRate) || 5.0`. An empty box, a non-numeric box
 *     AND a deliberately typed **0** all stored **five percent**. «This
 *     moderator earns no commission» was recorded as earning five.
 *
 * The 5.0 was declared nowhere: not in `schema.prisma` (`@default(0.0)`),
 * not in `0_init/migration.sql` (`DEFAULT 0.0`), not in the other door. It
 * entered with the initial commit and the only other place that number
 * exists is `prisma/seed.ts`, where three demo moderators are given a 5 on
 * purpose. A door that invents a rate is a door that disagrees with the
 * schema, with the other door, and with the person typing.
 *
 * So the rule is a value here and the doors import it. A second rule for
 * this column now has to be written on purpose, in this file, where the
 * first one is sitting.
 *
 * WHAT THIS COLUMN IS NOT: it is not what anybody is PAID. `commission.ts`
 * says so in its own header — the ledger accrues commission from the
 * commission RULES on delivery, and this per-user number reaches no money
 * path. It is shown on the moderators screen and carried in the session, so
 * a wrong value here misinforms a reader rather than paying them. That is
 * the severity, not the licence: a number a person typed and a number the
 * screen reads back must be the same number.
 */

/** A commission rate is a percentage, and half the order is already absurd. */
export const COMMISSION_RATE_MAX = 50;

/** What the person is told. One rule, so one sentence. */
export const COMMISSION_RATE_REFUSAL =
  `نسبة العمولة رقمٌ بين صفر و${COMMISSION_RATE_MAX}. اكتبها بالأرقام.`;

/**
 * The rate as it arrives in a request body.
 *
 * A NUMBER, not a numeric string: the column is a `Float` and a door that
 * accepts `"5"` is a door that also accepts `"5%"`, `"٥"` and `"abc"` and
 * has to guess which of them was a rate. `/api/users` has always refused a
 * string here; now both doors do.
 *
 * `.default(0)` rather than a fallback at the call site: zero is the
 * column's declared default and also a REAL value somebody may type, so the
 * one place that may turn «nothing typed» into a number is this one. A
 * `?? 0` after this schema can never fire — do not add one back.
 */
export const commissionRateField = z
  .number({ message: COMMISSION_RATE_REFUSAL })
  .min(0, COMMISSION_RATE_REFUSAL)
  .max(COMMISSION_RATE_MAX, COMMISSION_RATE_REFUSAL)
  .default(0);

/**
 * The same rule for a door that validates one field rather than a whole
 * body: the rate, or `null` when what arrived is not a rate — the caller
 * answers 400 with `COMMISSION_RATE_REFUSAL` and writes nothing.
 *
 * An absent key is not a refusal. It is «nobody typed a rate», which the
 * schema's own default answers with zero.
 */
export function readCommissionRate(raw: unknown): number | null {
  const parsed = commissionRateField.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
