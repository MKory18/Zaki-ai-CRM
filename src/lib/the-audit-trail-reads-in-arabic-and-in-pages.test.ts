import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE AUDIT TRAIL — READ IN PAGES, IN ARABIC, WITH A WAY TO THE RECORD.
 *
 * Before: the newest hundred rows, no filter, no pager, an English sentence for a heading,
 * the action as a machine code, the record as a bare uuid. The rows below are what the
 * route hands to the database and what the helpers say — the figures a reader depends on,
 * not the text of any expression.
 *
 * The line that must not move: the company in `where` is the SESSION's. No query the
 * screen can send widens it.
 */

const { db, requireCompanyTenant, requirePermission } = vi.hoisted(() => ({
  db: {
    auditLog: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
  requireCompanyTenant: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db, default: db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
// The reader holds «عرض الرواتب» here; the pay redaction is its own test (people-act-within-their-reach, the-people-doors-wiring).
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));

import { GET } from '@/app/api/audit-logs/route';
import { auditWhere, describeAction, entityHref, entityLabel, readAuditQuery, summariseChange } from './audit-view';

const ask = (qs = '') => GET(new Request(`http://x/api/audit-logs${qs ? `?${qs}` : ''}`));
const ID = '0f8c1b2a-1111-4222-8333-444455556666';

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ companyId: 'co-1' });
  requirePermission.mockResolvedValue(undefined);
  db.auditLog.count.mockResolvedValue(130);
  db.auditLog.findMany.mockResolvedValue([]);
  db.auditLog.groupBy.mockImplementation(async (a: { by: string[] }) =>
    a.by[0] === 'userId'
      ? [{ userId: 'u1', _count: { _all: 9 } }, { userId: null, _count: { _all: 30 } }]
      : [{ entity: 'Order', _count: { _all: 80 } }, { entity: 'Wallet', _count: { _all: 5 } }]
  );
  db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'سامر' }]);
});

describe('the door', () => {
  it('reads ONE page of 25 and says how many matched in all', async () => {
    const body = await (await ask('page=2')).json();
    const args = db.auditLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(25);
    expect(args.skip).toBe(25);
    expect(body.pagination).toEqual({ total: 130, page: 2, limit: 25, totalPages: 6 });
  });

  it('a page past the end is the last page, not an empty one', async () => {
    const body = await (await ask('page=99')).json();
    expect(body.pagination.page).toBe(6);
    expect(db.auditLog.findMany.mock.calls[0][0].skip).toBe(125);
  });

  it('a limit past the ceiling is the ceiling', async () => {
    await ask('limit=100000');
    expect(db.auditLog.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('every question is asked about the SESSION’s company — a company in the address changes nothing', async () => {
    await ask('companyId=co-2&user=u1&entity=Order');
    for (const call of [...db.auditLog.count.mock.calls, ...db.auditLog.findMany.mock.calls, ...db.auditLog.groupBy.mock.calls]) {
      expect(call[0].where.companyId).toBe('co-1');
    }
  });

  it('the figures beside the dropdowns are the whole company’s, with the automatic ones named', async () => {
    const { facts } = await (await ask('user=u1')).json();
    expect(facts.users).toEqual([
      { id: 'system', name: 'النظام (تلقائي)', count: 30 },
      { id: 'u1', name: 'سامر', count: 9 },
    ]);
    expect(facts.entities[0]).toEqual({ entity: 'Order', count: 80 });
    // choosing a person must not shrink the list of people
    for (const c of db.auditLog.groupBy.mock.calls) expect(c[0].where).toEqual({ companyId: 'co-1' });
  });

  it('NEGATIVE: without «audit.view» it answers the refusal and reads nothing', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('ليس لديك صلاحية'), { status: 403 }));
    const res = await ask();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(db.auditLog.count).not.toHaveBeenCalled();
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });
});

describe('what was asked', () => {
  it('only a real day is a day; anything else is «not asked», never a crash', () => {
    const q = readAuditQuery(new URLSearchParams('from=2026-10-01&to=yesterday'));
    expect(q.from).toBe('2026-10-01');
    expect(q.to).toBeUndefined();
    expect(readAuditQuery(new URLSearchParams('from=2026-13-45')).from).toBeUndefined();
  });

  it('«all» and an empty box are no choice', () => {
    expect(readAuditQuery(new URLSearchParams('user=all&entity=&q=%20%20'))).toEqual({
      user: undefined, entity: undefined, q: undefined, from: undefined, to: undefined,
    });
  });

  it('a span of days takes the whole of both days', () => {
    const where = auditWhere('co-1', { from: '2026-10-01', to: '2026-10-02' }) as any;
    expect(where.AND[0].createdAt.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(where.AND[0].createdAt.lte.toISOString()).toBe('2026-10-02T23:59:59.999Z');
  });

  it('«النظام» is the rows with no user, not a user called system', () => {
    expect((auditWhere('co-1', { user: 'system' }) as any).AND).toEqual([{ userId: null }]);
    expect((auditWhere('co-1', { user: 'u1' }) as any).AND).toEqual([{ userId: 'u1' }]);
  });

  it('typing the Arabic word finds the codes that read so — a whole phrase AND a trailing verb', () => {
    const or = (auditWhere('co-1', { q: 'حذف' }) as any).AND[0].OR;
    expect(or).toContainEqual({ action: { endsWith: '_DELETED' } });
    expect((auditWhere('co-1', { q: 'تأكيد طلب' }) as any).AND[0].OR).toContainEqual({ action: { in: ['ORDER_CONFIRMED'] } });
    expect((auditWhere('co-1', { q: 'محفظة' }) as any).AND[0].OR).toContainEqual({ entity: { in: expect.arrayContaining(['Wallet', 'WalletMovement']) } });
  });

  it('a word matches the record’s id from its start', () => {
    expect((auditWhere('co-1', { q: ID.slice(0, 8) }) as any).AND[0].OR).toContainEqual({ entityId: { startsWith: ID.slice(0, 8), mode: 'insensitive' } });
  });
});

describe('what a row says', () => {
  it('a known code reads in Arabic', () => {
    expect(describeAction('ORDER_STATUS_CHANGED', 'Order')).toBe('تغيير حالة طلب');
    expect(describeAction('USER_LOGGED_IN', 'User')).toBe('تسجيل دخول');
  });

  it('a code with a known ending and a known record reads «verb + record»', () => {
    expect(describeAction('WALLET_CREATED', 'Wallet')).toBe('إنشاء محفظة');
    expect(describeAction('TRACKING_PIXEL_DELETED', 'TrackingPixel')).toBe('حذف بكسل تتبّع');
  });

  it('NEGATIVE: a code nobody translated is shown AS ITSELF, never blank', () => {
    expect(describeAction('SOMETHING_NEW_HAPPENED', 'Order')).toBe('SOMETHING_NEW_HAPPENED');
    expect(describeAction('whatsapp.message.send', 'WhatsAppMessage')).toBe('whatsapp.message.send');
    expect(entityLabel('BrandNewThing')).toBe('BrandNewThing');
  });

  it('only an order and a product have a page — the rest are plain text', () => {
    expect(entityHref('Order', ID)).toBe(`/orders/${ID}`);
    expect(entityHref('Product', ID)).toBe(`/products/${ID}`);
    expect(entityHref('Wallet', ID)).toBeNull();
    expect(entityHref('Order', '../../etc')).toBeNull();
  });

  it('the change is a glance of «key: value», and the raw text when it is not JSON', () => {
    expect(summariseChange(JSON.stringify({ status: 'CONFIRMED', note: '', nested: { a: 1 }, n: 3 }))).toBe('status: CONFIRMED · n: 3');
    expect(summariseChange('not json at all')).toBe('not json at all');
    expect(summariseChange(null)).toBe('—');
    expect(summariseChange('x'.repeat(200)).length).toBeLessThanOrEqual(91);
  });
});
