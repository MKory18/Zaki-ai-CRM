import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ONE KEY OF THE SETTINGS DOCUMENT, CHANGED UNDER A LOCK.
 *
 * Two writers used to read the whole document and write it all back, so a
 * template save beside a key removal restored the removed key.
 */

const { db, row } = vi.hoisted(() => ({
  row: { settings: null as string | null },
  db: { $transaction: vi.fn() },
}));
vi.mock('./db', () => ({ db }));

import { updateCompanySettings } from './company-settings';

let queries: string[] = [];

beforeEach(() => {
  queries = [];
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: async (strings: TemplateStringsArray) => {
        queries.push(strings.join('?'));
        return [{ settings: row.settings }];
      },
      company: { update: async ({ data }: { data: { settings: string } }) => { row.settings = data.settings; } },
    })
  );
});

describe('updateCompanySettings', () => {
  it('reads the row FOR UPDATE — the lock is what serialises two saves', async () => {
    row.settings = '{}';
    await updateCompanySettings('c1', 'messageTemplates', () => []);
    expect(queries[0]).toMatch(/FOR UPDATE/);
  });

  it('changes its own key and leaves every other key as the row holds it', async () => {
    row.settings = JSON.stringify({ ai: { apiKeyEncrypted: 'X' }, messageTemplates: [1] });
    await updateCompanySettings('c1', 'messageTemplates', () => [2]);
    expect(JSON.parse(row.settings!)).toEqual({ ai: { apiKeyEncrypted: 'X' }, messageTemplates: [2] });
  });

  it('sees the previous save\'s result, not a stale read', async () => {
    row.settings = JSON.stringify({ ai: { apiKeyEncrypted: 'X' } });
    await updateCompanySettings<{ apiKeyEncrypted?: string }>('c1', 'ai', () => ({}));
    await updateCompanySettings('c1', 'messageTemplates', () => ['t']);
    expect(JSON.parse(row.settings!).ai).toEqual({});
  });

  it('removes the key when told undefined, and survives a broken document', async () => {
    row.settings = '{not json';
    await updateCompanySettings('c1', 'ai', () => undefined);
    expect(JSON.parse(row.settings!)).toEqual({});
  });
});
