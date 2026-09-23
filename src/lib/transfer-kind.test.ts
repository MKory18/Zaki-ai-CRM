import { describe, it, expect } from 'vitest';
import { readTransfer, transferKind, transferRefusal, type TransferSide } from './transfer-kind';

const wallet = (over: Partial<TransferSide> = {}): TransferSide => ({
  id: 'w1',
  name: 'الصندوق',
  currencyCode: 'USD',
  storeId: 'sA',
  countryId: 'SY',
  storeName: 'صحة بلس',
  countryName: 'سوريا',
  ...over,
});

describe('the three transfers, told apart by the wallets themselves', () => {
  it('two wallets of one store is an internal move', () => {
    const r = readTransfer(wallet(), wallet({ id: 'w2', name: 'البنك' }));
    expect(r.kind).toBe('INTERNAL');
    expect(r.label).toBe('تحويل داخلي');
    expect(r.detail).toBe('داخل صحة بلس — الصندوق ← البنك');
    expect(r.needsRate).toBe(false);
  });

  it('two stores in one country is a move between two sets of books', () => {
    const r = readTransfer(
      wallet(),
      wallet({ id: 'w2', storeId: 'sB', storeName: 'متجر ثانٍ' })
    );
    expect(r.kind).toBe('BETWEEN_STORES');
    expect(r.detail).toContain('دفتران مختلفان');
    expect(r.needsRate).toBe(false);
  });

  it('two countries is its own thing, and the only one that changes currency', () => {
    const r = readTransfer(
      wallet(),
      wallet({ id: 'w2', countryId: 'JO', currencyCode: 'JOD', storeId: 'sB', countryName: 'الأردن' })
    );
    expect(r.kind).toBe('BETWEEN_COUNTRIES');
    expect(r.detail).toBe('من سوريا (USD) إلى الأردن (JOD)');
    expect(r.needsRate).toBe(true);
  });

  it('a different country wins over a different store — it is the bigger fact', () => {
    expect(
      transferKind(wallet(), wallet({ id: 'w2', countryId: 'JO', storeId: 'sB' }))
    ).toBe('BETWEEN_COUNTRIES');
  });

  // A wallet nobody has placed yet is nobody's money, so pairing it with a
  // store's wallet still crosses a boundary. Calling that internal would
  // hide the move inside one store's daily closing.
  it('an unplaced wallet is not "the same store"', () => {
    expect(transferKind(wallet(), wallet({ id: 'w2', storeId: null }))).toBe('BETWEEN_STORES');
    expect(transferKind(wallet({ storeId: null }), wallet({ id: 'w2', storeId: null }))).toBe('INTERNAL');
  });

  it('asks for a rate only when the currency actually changes', () => {
    // Same country, same currency, different stores — no rate.
    expect(readTransfer(wallet(), wallet({ id: 'w2', storeId: 'sB' })).needsRate).toBe(false);
    // Different country but the same currency — still no rate to apply.
    expect(
      readTransfer(wallet(), wallet({ id: 'w2', countryId: 'LY', storeId: 'sB' })).needsRate
    ).toBe(false);
  });
});

describe('pairs that must be refused rather than recorded', () => {
  it('a wallet to itself', () => {
    expect(transferRefusal(wallet(), wallet())).toBe('لا يمكن التحويل إلى نفس المحفظة');
  });

  // One country has one currency. Two wallets there holding different ones
  // is a setup error, and a rate entered here would bury it in a movement
  // nobody could explain afterwards.
  it('two currencies inside one country — the data is wrong, not the transfer', () => {
    const said = transferRefusal(wallet(), wallet({ id: 'w2', currencyCode: 'JOD', storeId: 'sB' }));
    expect(said).toContain('بلد واحد بعملتين');
    expect(said).toContain('USD');
    expect(said).toContain('JOD');
  });

  it('lets an ordinary pair through', () => {
    expect(transferRefusal(wallet(), wallet({ id: 'w2', name: 'البنك' }))).toBeNull();
    expect(
      transferRefusal(wallet(), wallet({ id: 'w2', countryId: 'JO', currencyCode: 'JOD', storeId: 'sB' }))
    ).toBeNull();
  });
});
