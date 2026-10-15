import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { V1_CODE, V1Fault } from './door';

/**
 * THE SAME REQUEST, SENT TWICE, IS ONE ORDER.
 *
 * Another system retries. A worker restarts mid-call, a socket times out
 * after the write landed, a person presses «ترحيل» again because the first
 * press showed nothing. A door that creates an order per call turns one
 * customer into two orders, two reservations and two waybills — and the
 * second one is discovered by the courier, not by us.
 *
 * So every write at `/api/v1` carries `Idempotency-Key`, the FIRST answer is
 * stored, and a repeat of the same request is answered with it. The order is
 * created once.
 *
 * ── WHY A CLAIM, AND NOT A LOOK-BEFORE-WRITE ──
 *
 * «Have I seen this key?» followed by «then create the order» is a read and
 * a write with a gap in it, and every transaction in this product runs at
 * READ COMMITTED — so two retries arriving in the same second both read
 * «no», and both create. `reservation.ts` measured that exact shape taking
 * 800 units off a shelf of 500.
 *
 * The UNIQUE INDEX closes it instead. The first caller INSERTS a claim and
 * wins; the second one's insert is refused by the database, and it is the
 * refusal — not a read — that tells it somebody else is answering. There is
 * no gap, because there is no read to race.
 */

/**
 * WHAT MAKES TWO REQUESTS «THE SAME ONE».
 *
 * The method, the path and the body — all three. Not the body alone: the
 * same JSON posted to `/orders` and to `/orders/x/notes` is two different
 * intentions, and a key reused across them must be a conflict rather than a
 * replay of the wrong answer.
 *
 * Hashed rather than stored: the body carries the customer's name, phone and
 * address, and this table is a retry ledger, not a second copy of the order.
 */
export function requestFingerprint(method: string, path: string, body: string): string {
  return crypto
    .createHash('sha256')
    .update(`${method.toUpperCase()} ${path}\n${body}`, 'utf8')
    .digest('hex');
}

/** The key the caller sent, validated. Absent is a refusal, not a default. */
export function idempotencyKeyOf(req: Request): string {
  const raw = (req.headers.get('idempotency-key') ?? '').trim();
  if (!raw) {
    throw new V1Fault(
      400,
      V1_CODE.IDEMPOTENCY_KEY_REQUIRED,
      'Idempotency-Key is required on every write'
    );
  }
  if (raw.length > 200) {
    throw new V1Fault(400, V1_CODE.VALIDATION_FAILED, 'Idempotency-Key is too long', {
      field: 'Idempotency-Key',
      max_length: 200,
    });
  }
  return raw;
}

/** The stored first answer, replayed exactly as it was sent. */
export interface Replay {
  status: number;
  body: unknown;
}

/**
 * CLAIM THIS KEY, OR HAND BACK WHAT WAS ALREADY ANSWERED.
 *
 *   `{ replay }`  — the same key AND the same body: the first answer, as it
 *                   was. The contract's «200 لنفس المفتاح — نفس الطلب، ولا
 *                   نسخة تانية».
 *   `null`        — this caller owns the key and must now do the work, then
 *                   call `remember` (or `release` if it throws).
 *
 * Throws `IDEMPOTENCY_CONFLICT` when the key is held by a DIFFERENT body —
 * two different orders claiming one key is a mistake in the caller, and
 * answering it with the first order's number would quietly drop the second
 * order on the floor.
 *
 * Throws `IDEMPOTENCY_IN_PROGRESS` when the first caller has not finished.
 * 409 and not a wait: the replies system retries on a schedule, and holding
 * a request open while another one commits is how two slow calls become
 * four.
 */
export async function claimIdempotency(
  companyId: string,
  key: string,
  requestHash: string
): Promise<Replay | null> {
  try {
    await db.idempotencyRecord.create({
      data: { companyId, key, requestHash, status: 0, response: '' },
    });
    return null;
  } catch (e) {
    const taken = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
    if (!taken) throw e;
  }

  // Somebody holds it. Which of the three things that means is decided by
  // what they stored, never by what this caller sent.
  const held = await db.idempotencyRecord.findUnique({
    where: { companyId_key: { companyId, key } },
    select: { requestHash: true, status: true, response: true },
  });

  /*
   * IT CAN BE GONE. `release` deletes a claim whose work threw, so a retry
   * can take the key. If that happened between the failed insert and this
   * read, the honest answer is «try again» — not «create a second order»,
   * which is what falling through to `null` would do.
   */
  if (!held) {
    throw new V1Fault(
      409,
      V1_CODE.IDEMPOTENCY_IN_PROGRESS,
      'This Idempotency-Key is being retried; send the same request again'
    );
  }

  if (held.requestHash !== requestHash) {
    throw new V1Fault(
      409,
      V1_CODE.IDEMPOTENCY_CONFLICT,
      'This Idempotency-Key was used for a different request body'
    );
  }

  if (held.status === 0) {
    throw new V1Fault(
      409,
      V1_CODE.IDEMPOTENCY_IN_PROGRESS,
      'The first request with this Idempotency-Key has not finished yet'
    );
  }

  /*
   * THE ANSWER IS REPLAYED, AND A 201 BECOMES A 200.
   *
   * «رد 201 (أو 200 لنفس المفتاح — نفس الطلب، ولا نسخة تانية)». The
   * distinction is the whole value of the mechanism to the caller: 201
   * means «I made it», 200 means «it was already made». Replaying the
   * stored 201 would tell a retry it had just created an order.
   */
  return {
    status: held.status === 201 ? 200 : held.status,
    body: parseStored(held.response),
  };
}

/** Store the answer this key will replay from now on. */
export async function rememberIdempotency(
  companyId: string,
  key: string,
  status: number,
  body: unknown
): Promise<void> {
  await db.idempotencyRecord.update({
    where: { companyId_key: { companyId, key } },
    data: { status, response: JSON.stringify(body) },
  });
}

/**
 * Give the key back, because the work failed.
 *
 * Without this, a request that fell over on a database hiccup would hold its
 * key for ever and every retry would meet `IDEMPOTENCY_IN_PROGRESS` — the
 * caller permanently unable to place an order it never placed. A claim is
 * only worth keeping once there is an answer behind it.
 */
export async function releaseIdempotency(companyId: string, key: string): Promise<void> {
  await db.idempotencyRecord
    .deleteMany({ where: { companyId, key, status: 0 } })
    .catch(() => undefined);
}

/** A stored body that will not parse is a bug, not a reason to 500 a retry. */
function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
