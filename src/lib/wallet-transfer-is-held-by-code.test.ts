import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';

/**
 * A CONSTRAINT THE DATABASE DOES NOT HOLD, HELD BY A TEST INSTEAD.
 *
 * `WalletTransfer.fromWalletId` / `toWalletId` are plain strings — alone
 * among the eight relations to `Wallet`, this one has no foreign key, so
 * Postgres would happily keep a transfer pointing at a wallet that is gone.
 *
 * Adding the constraint means a migration that fails outright if one orphan
 * row already exists, on live financial data. Asked and answered by the owner
 * (2026-10-02): **leave it, documented**.
 *
 * «Documented» is only worth something if it stays true. What actually
 * protects the data is the wallet DELETE counting transfers on both sides and
 * refusing while any exist. So that is what is asserted here: the day a
 * delete path stops counting them, this fails — and the declared hole becomes
 * a real one in a diff rather than in production.
 */

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));

describe('the wallet delete refuses while a transfer names it', () => {
  const route = read('src/app/api/finance/wallets/[id]/route.ts');

  it('counts transfers on BOTH sides, not just the one it came from', () => {
    // Counting only `fromWalletId` would let the destination wallet be
    // deleted, which is the same orphan from the other end.
    expect(route).toContain('walletTransfer.count');
    expect(route).toMatch(/fromWalletId: id/);
    expect(route).toMatch(/toWalletId: id/);
    // Both in one OR, so a wallet on either side blocks the delete.
    expect(route).toMatch(/OR: \[\{ fromWalletId: id \}, \{ toWalletId: id \}\]/);
  });

  it('and the count is actually consulted before anything is deleted', () => {
    // A count whose result is never read is a query that reassures a reader
    // and stops nothing.
    const counted = route.indexOf('walletTransfer.count');
    const deleted = route.indexOf('wallet.delete');
    expect(counted).toBeGreaterThan(-1);
    expect(deleted).toBeGreaterThan(-1);
    expect(counted).toBeLessThan(deleted);
  });
});

describe('and the schema says why the key is missing', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const block = schema.slice(
    schema.indexOf('model WalletTransfer') - 1400,
    schema.indexOf('model WalletTransfer') + 200
  );

  it('so the next reader does not take it for an oversight and "fix" it', () => {
    expect(block).toMatch(/NO FOREIGN KEY/);
    // The reason the easy fix is not free.
    expect(block).toMatch(/orphan/i);
    // And where the rule actually lives.
    expect(block).toContain('usageOf');
  });

  it('and it is still a string, so this file has not gone stale', () => {
    // If somebody DOES add the relation one day, the comment above is wrong
    // and this test is the thing that says so.
    const model = schema.slice(schema.indexOf('model WalletTransfer'));
    const body = model.slice(0, model.indexOf('}'));
    expect(body).toMatch(/fromWalletId String/);
    expect(body).not.toMatch(/fromWallet\s+Wallet/);
  });
});
