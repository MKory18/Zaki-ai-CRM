/**
 * WHAT KIND OF TRANSFER THIS IS — decided by the two wallets, not chosen.
 *
 * The owner thinks of three separate things: moving money inside a store,
 * moving it between stores, and moving it between countries. They ARE three
 * different acts — the middle one crosses two sets of books, the last one
 * crosses a currency as well.
 *
 * But they are not three screens. Three screens means three forms to learn,
 * three places for a rule to drift, and a person who picked the wrong one
 * before they started. Instead there is one act — money leaves this wallet
 * and arrives in that one — and the system reads the two wallets and says
 * which of the three you are about to do, before you commit.
 *
 * That also makes the rate impossible to misapply: it is asked for in
 * exactly one case, the only one where the currency changes.
 *
 * The answer is recorded on the transfer when it happens. Deriving it again
 * later would let a wallet moved to another store rewrite what every past
 * transfer meant, and a transfer is a thing that happened.
 */

export type TransferKind = 'INTERNAL' | 'BETWEEN_STORES' | 'BETWEEN_COUNTRIES';

export interface TransferSide {
  id: string;
  name: string;
  currencyCode: string;
  storeId: string | null;
  countryId: string;
  storeName?: string | null;
  countryName?: string | null;
}

export interface TransferReading {
  kind: TransferKind;
  /** The short name for it, as the screen says it. */
  label: string;
  /** The one sentence that tells you what you are about to do. */
  detail: string;
  /** True only when the currency changes — the one case needing a rate. */
  needsRate: boolean;
}

const LABELS: Record<TransferKind, string> = {
  INTERNAL: 'تحويل داخلي',
  BETWEEN_STORES: 'بين متجرين',
  BETWEEN_COUNTRIES: 'بين دولتين',
};

export function transferKind(from: TransferSide, to: TransferSide): TransferKind {
  if (from.countryId !== to.countryId) return 'BETWEEN_COUNTRIES';
  // Same country. A wallet with no store yet is nobody's, so pairing it with
  // one that has a store is still a move between two sets of books.
  if (from.storeId !== to.storeId) return 'BETWEEN_STORES';
  return 'INTERNAL';
}

export function readTransfer(from: TransferSide, to: TransferSide): TransferReading {
  const kind = transferKind(from, to);
  const needsRate = from.currencyCode !== to.currencyCode;

  const store = (w: TransferSide) => w.storeName ?? 'بلا متجر';
  const country = (w: TransferSide) => w.countryName ?? '';

  const detail =
    kind === 'INTERNAL'
      ? `داخل ${store(from)} — ${from.name} ← ${to.name}`
      : kind === 'BETWEEN_STORES'
        ? `من ${store(from)} إلى ${store(to)} — دفتران مختلفان`
        : `من ${country(from)} (${from.currencyCode}) إلى ${country(to)} (${to.currencyCode})`;

  return { kind, label: LABELS[kind], detail, needsRate };
}

export const TRANSFER_KIND_LABEL = LABELS;

/**
 * Reasons a pair of wallets cannot be transferred between at all.
 *
 * Returns the Arabic reason, or null when the pair is fine. These are the
 * cases where going ahead would produce a record nobody can later explain.
 */
export function transferRefusal(from: TransferSide, to: TransferSide): string | null {
  if (from.id === to.id) return 'لا يمكن التحويل إلى نفس المحفظة';

  // One country, one currency — so two wallets in the same country holding
  // different ones means the data is wrong, and a rate entered here would
  // bury that rather than surface it.
  if (from.countryId === to.countryId && from.currencyCode !== to.currencyCode) {
    return `محفظتان في بلد واحد بعملتين مختلفتين (${from.currencyCode} و${to.currencyCode}) — راجع إعداد المحفظتين`;
  }

  return null;
}
