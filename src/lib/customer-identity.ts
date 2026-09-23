import type { Prisma } from '@prisma/client';
import { db } from './db';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * FINDING A CUSTOMER, OR MAKING ONE — in a store.
 *
 * Five places did this: the customers screen, a manual order, a landing
 * page submission, a Telegram message and the AI intake. Five copies of one
 * rule, and the copy that drifts here either creates a duplicate customer
 * or attaches an order to the wrong person's history.
 *
 * The phone is the identity, and it identifies someone WITHIN A STORE. The
 * stores are separate businesses: the same person may buy from two of them
 * and each keeps its own record, its own notes and its own idea of whether
 * this is a good customer. One shared row would put one store's complaint
 * on the other's screen.
 *
 * The BLACKLIST is company-wide and is checked elsewhere, by contract.
 * Blocking a number is a judgement about a person, not about one shop, and
 * a blocked number that can simply order from the store next door blocks
 * nothing.
 */

export interface CustomerSeed {
  companyId: string;
  storeId: string;
  /** Normalized digits — the form the unique index is on. */
  phone: string;
  rawPhone: string;
  fullName: string;
  /** Required by the model — an empty string when the door did not ask. */
  address: string;
  city: string;
  altPhone?: string | null;
  notes?: string | null;
}

/** The existing customer of this store, or null. */
export async function findCustomer(tx: Tx, companyId: string, storeId: string, phone: string) {
  return tx.customer.findFirst({ where: { companyId, storeId, phone } });
}

/**
 * The customer of this store, created if new.
 *
 * Two people submitting the same number at the same moment is ordinary on a
 * landing page. The loser of that race reads the row the winner made rather
 * than failing an order the customer already thinks they placed — which is
 * why the unique index is the thing relied on, not a prior read.
 */
export async function findOrCreateCustomer(tx: Tx, seed: CustomerSeed) {
  const existing = await findCustomer(tx, seed.companyId, seed.storeId, seed.phone);
  if (existing) return existing;

  try {
    return await tx.customer.create({
      data: {
        companyId: seed.companyId,
        storeId: seed.storeId,
        phone: seed.phone,
        rawPhone: seed.rawPhone,
        fullName: seed.fullName,
        address: seed.address,
        city: seed.city,
        ...(seed.altPhone !== undefined ? { altPhone: seed.altPhone } : {}),
        ...(seed.notes !== undefined ? { notes: seed.notes } : {}),
      },
    });
  } catch (e) {
    // P2002: somebody else created the same (company, store, phone) first.
    if ((e as { code?: string })?.code !== 'P2002') throw e;
    const won = await findCustomer(tx, seed.companyId, seed.storeId, seed.phone);
    if (!won) throw e; // the clash was on something else
    return won;
  }
}
