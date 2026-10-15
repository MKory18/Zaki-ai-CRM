import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * O7 — THE SAME REQUEST, SENT TWICE, IS ONE ORDER.
 *
 * THE DEFECT THIS EXISTS FOR, and it is not hypothetical in this product:
 * `reservation.ts` measured two transactions each reserving 400 units of a
 * batch of 500, both succeeding, because every transaction here runs at
 * READ COMMITTED and T2's read cannot see T1's uncommitted write. A retry
 * ledger built as «look, then create» has exactly that shape — and what
 * lands on the floor is not a reservation but a second ORDER, a second
 * waybill, and a parcel the courier discovers before we do.
 *
 * So the UNIQUE INDEX is the mechanism and this file proves the code leans
 * on it: the first caller INSERTS and wins, and it is the database's REFUSAL
 * — not a prior read — that tells the second one somebody else is answering.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db } = vi.hoisted(() => ({
  db: {
    idempotencyRecord: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('../db', () => ({ db }));

import { Prisma } from '@prisma/client';
import { V1_CODE, V1Fault } from './door';
import {
  claimIdempotency,
  idempotencyKeyOf,
  releaseIdempotency,
  rememberIdempotency,
  requestFingerprint,
} from './idempotency';

const TAKEN = new Prisma.PrismaClientKnownRequestError('taken', {
  code: 'P2002',
  clientVersion: 'test',
});

const req = (headers: Record<string, string> = {}) =>
  new Request('https://oms.test/api/v1/orders', { method: 'POST', headers });

async function faultOf(fn: () => Promise<unknown>): Promise<V1Fault | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof V1Fault ? e : null;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  db.idempotencyRecord.update.mockResolvedValue({});
  db.idempotencyRecord.deleteMany.mockResolvedValue({ count: 1 });
});

describe('the key the caller must send', () => {
  it('is required on a write — absent is a refusal, never a default', () => {
    /*
     * A default would be the worst of the three options available: a door
     * that invents a key per request is a door with no idempotency at all,
     * while looking like one that has it.
     */
    expect(() => idempotencyKeyOf(req())).toThrow(V1Fault);
    const fault = (() => {
      try {
        idempotencyKeyOf(req());
      } catch (e) {
        return e as V1Fault;
      }
    })();
    expect(fault?.status).toBe(400);
    expect(fault?.code).toBe(V1_CODE.IDEMPOTENCY_KEY_REQUIRED);
  });

  it('and whitespace is not a key', () => {
    expect(() => idempotencyKeyOf(req({ 'idempotency-key': '   ' }))).toThrow(V1Fault);
  });

  it('and it is bounded, because it becomes a column', () => {
    expect(() => idempotencyKeyOf(req({ 'idempotency-key': 'k'.repeat(201) }))).toThrow(V1Fault);
    expect(idempotencyKeyOf(req({ 'idempotency-key': 'k'.repeat(200) }))).toHaveLength(200);
  });

  it('and it is taken as sent, trimmed', () => {
    expect(idempotencyKeyOf(req({ 'idempotency-key': ' ORD-MG8K2J-X7Q ' }))).toBe('ORD-MG8K2J-X7Q');
  });
});

describe('what makes two requests «the same one»', () => {
  it('is the method, the path AND the body — all three', () => {
    const body = '{"a":1}';
    expect(requestFingerprint('POST', '/api/v1/orders', body)).not.toBe(
      requestFingerprint('POST', '/api/v1/orders/x/notes', body)
    );
    expect(requestFingerprint('POST', '/p', body)).not.toBe(requestFingerprint('PUT', '/p', body));
    expect(requestFingerprint('POST', '/p', '{"a":1}')).not.toBe(
      requestFingerprint('POST', '/p', '{"a":2}')
    );
  });

  it('and the same three give the same answer every time', () => {
    const a = requestFingerprint('POST', '/api/v1/orders', '{"a":1}');
    const b = requestFingerprint('post', '/api/v1/orders', '{"a":1}');
    expect(a).toBe(b); // the method is a method, not a spelling
    expect(a).toHaveLength(64);
  });

  it('and the body is HASHED, not stored — it carries a customer', () => {
    const body = '{"customer":{"name":"أبو أحمد","phone":"0936654998"}}';
    const print = requestFingerprint('POST', '/api/v1/orders', body);
    expect(print).not.toContain('0936654998');
    expect(print).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('claiming the key', () => {
  it('inserts first and asks nothing, so there is no read to race', async () => {
    db.idempotencyRecord.create.mockResolvedValue({});
    expect(await claimIdempotency('c1', 'k1', 'h1')).toBeNull();
    // The ORDER of these two is the whole guarantee.
    expect(db.idempotencyRecord.create).toHaveBeenCalledTimes(1);
    expect(db.idempotencyRecord.findUnique).not.toHaveBeenCalled();
  });

  it('and the claim is scoped to the company, so two companies cannot collide', async () => {
    db.idempotencyRecord.create.mockResolvedValue({});
    await claimIdempotency('c1', 'k1', 'h1');
    expect(db.idempotencyRecord.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'c1',
      key: 'k1',
      requestHash: 'h1',
      status: 0,
    });
  });

  it('and a failure that is NOT a collision is not swallowed', async () => {
    /*
     * A `catch` that treated every error as «somebody holds it» would turn
     * a database outage into `IDEMPOTENCY_IN_PROGRESS` for ever, and the
     * caller could never place the order.
     */
    db.idempotencyRecord.create.mockRejectedValue(new Error('database gone'));
    await expect(claimIdempotency('c1', 'k1', 'h1')).rejects.toThrow('database gone');
  });
});

describe('the same key sent again', () => {
  it('with the same body, replays the first answer and does NOT create', async () => {
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 201,
      response: '{"order_number":"SY-2026-0148"}',
    });
    const replay = await claimIdempotency('c1', 'k1', 'h1');
    expect(replay?.body).toEqual({ order_number: 'SY-2026-0148' });
  });

  it('and the replay is 200, not the 201 that was stored', async () => {
    /*
     * «رد 201 (أو 200 لنفس المفتاح — نفس الطلب، ولا نسخة تانية)». Replaying
     * the stored 201 would tell a retry it had just created an order, which
     * is the one thing the caller is asking this mechanism to tell it apart.
     */
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 201,
      response: '{"ok":true}',
    });
    expect((await claimIdempotency('c1', 'k1', 'h1'))?.status).toBe(200);
  });

  it('and a stored non-201 is replayed exactly as it was', async () => {
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 422,
      response: '{"error":{"code":"CUSTOMER_BLACKLISTED"}}',
    });
    expect((await claimIdempotency('c1', 'k1', 'h1'))?.status).toBe(422);
  });

  it('WITH A DIFFERENT BODY, is a conflict — not the first order’s number', async () => {
    /*
     * Two different orders claiming one key is a mistake in the caller, and
     * answering it with the first order's number would quietly drop the
     * second customer's order on the floor with a success code on top.
     */
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 201,
      response: '{"order_number":"SY-2026-0148"}',
    });
    const fault = await faultOf(() => claimIdempotency('c1', 'k1', 'h_different'));
    expect(fault?.status).toBe(409);
    expect(fault?.code).toBe(V1_CODE.IDEMPOTENCY_CONFLICT);
  });

  it('and the body check comes BEFORE the in-progress check', async () => {
    // A different body against a claim still being answered is still a
    // conflict: it will never become a legitimate replay.
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 0,
      response: '',
    });
    const fault = await faultOf(() => claimIdempotency('c1', 'k1', 'h_different'));
    expect(fault?.code).toBe(V1_CODE.IDEMPOTENCY_CONFLICT);
  });

  it('while the first one is still running, is told to come back', async () => {
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 0,
      response: '',
    });
    const fault = await faultOf(() => claimIdempotency('c1', 'k1', 'h1'));
    expect(fault?.status).toBe(409);
    expect(fault?.code).toBe(V1_CODE.IDEMPOTENCY_IN_PROGRESS);
  });

  it('and a claim that vanished between the two steps does not create a second order', async () => {
    /*
     * `release` deletes a claim whose work threw, and it can land between
     * the failed insert and the read. Falling through to «you own the key»
     * there is exactly the duplicate this table exists to refuse, so the
     * honest answer is «send it again».
     */
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue(null);
    const fault = await faultOf(() => claimIdempotency('c1', 'k1', 'h1'));
    expect(fault?.code).toBe(V1_CODE.IDEMPOTENCY_IN_PROGRESS);
  });

  it('and a stored body that will not parse does not 500 the retry', async () => {
    db.idempotencyRecord.create.mockRejectedValue(TAKEN);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'h1',
      status: 201,
      response: 'not json',
    });
    expect((await claimIdempotency('c1', 'k1', 'h1'))?.body).toBeNull();
  });
});

describe('storing and giving back the key', () => {
  it('writes the answer against the company and the key, never the key alone', async () => {
    await rememberIdempotency('c1', 'k1', 201, { ok: true });
    expect(db.idempotencyRecord.update.mock.calls[0][0].where).toEqual({
      companyId_key: { companyId: 'c1', key: 'k1' },
    });
    expect(db.idempotencyRecord.update.mock.calls[0][0].data).toEqual({
      status: 201,
      response: '{"ok":true}',
    });
  });

  it('and releasing only ever deletes an UNANSWERED claim', async () => {
    /*
     * `status: 0` in the WHERE is what stops a late failure path wiping a
     * key that already has a real answer behind it — which would let the
     * same request create a second order on its next retry.
     */
    await releaseIdempotency('c1', 'k1');
    expect(db.idempotencyRecord.deleteMany.mock.calls[0][0].where).toEqual({
      companyId: 'c1',
      key: 'k1',
      status: 0,
    });
  });

  it('and a release that itself fails does not replace the real error', async () => {
    db.idempotencyRecord.deleteMany.mockRejectedValue(new Error('database gone'));
    await expect(releaseIdempotency('c1', 'k1')).resolves.toBeUndefined();
  });
});
