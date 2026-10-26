import type { Prisma } from '@prisma/client';
import { db } from './db';
import { canonicalPhone, phoneKeys } from './phone-rules';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * The blacklist.
 *
 * Keyed on the PHONE, company-wide. The phone is the identity: somebody who
 * refused delivery three times will order again under a new name, and the
 * same person is the same person in every store, so a block scoped to one
 * country would be a block somebody can walk around.
 *
 * A block is never deleted, only RELEASED — who blocked whom and why
 * survives the decision to let them back, the same reversal-only discipline
 * the financial records follow.
 *
 * What a block does NOT do is delete or hide anything. Existing orders stay
 * exactly as they are; the block stops the NEXT one.
 */

export interface ActiveBlock {
  id: string;
  phone: string;
  name: string | null;
  reason: string;
  createdAt: Date;
  blockedById: string;
}

/**
 * The active block on this phone, or null.
 *
 * Matched on the CANONICAL form, not the stored display form: a block that
 * can be walked around by writing "+963 966 793918" instead of "0966793918"
 * is not a block.
 */
export async function activeBlock(
  tx: Tx,
  companyId: string,
  rawPhone: string,
  countryCode?: string | null
): Promise<ActiveBlock | null> {
  // Every form the number may be stored in: as read without a country, as the store reads it (a foreign number keeps
  // its code, RV136), and the older code-less form of either. A block is company-wide; the store it was written from
  // must not decide whether it holds.
  const keys = [...new Set([...phoneKeys(canonicalPhone(rawPhone)), ...phoneKeys(canonicalPhone(rawPhone, countryCode))])];
  if (keys.length === 0) return null;

  return tx.customerBlock.findFirst({
    where: { companyId, phone: { in: keys }, releasedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, phone: true, name: true, reason: true, createdAt: true, blockedById: true },
  });
}

/** True when this phone may not place an order. */
export async function isBlocked(tx: Tx, companyId: string, rawPhone: string, countryCode?: string | null): Promise<boolean> {
  return (await activeBlock(tx, companyId, rawPhone, countryCode)) !== null;
}

/**
 * What a blocked visitor is told on a public page.
 *
 * Deliberately says nothing. Telling somebody they are blacklisted invites
 * them to try another number, and tells them which number is burned. The
 * order simply does not go through.
 */
export const NEUTRAL_REFUSAL = 'تعذر إرسال الطلب، يرجى التواصل معنا';

export class AlreadyBlocked extends Error {
  constructor(readonly phone: string) {
    super('هذا الرقم محظور بالفعل');
  }
}

/** Blocks a phone. Refuses to stack a second active block on the same one. */
export async function blockPhone(
  tx: Tx,
  input: { companyId: string; phone: string; name?: string | null; reason: string; blockedById: string }
) {
  // Stored in the code-less form, the one every reading of the number shares — `activeBlock` finds it from any of them.
  const phone = phoneKeys(canonicalPhone(input.phone)).at(-1) ?? '';
  if (!phone) throw new Error('رقم هاتف غير صالح');
  if (!input.reason.trim()) throw new Error('سبب الحظر إلزامي');

  const existing = await activeBlock(tx, input.companyId, phone);
  if (existing) throw new AlreadyBlocked(phone);

  return tx.customerBlock.create({
    data: {
      companyId: input.companyId,
      phone,
      name: input.name?.trim() || null,
      reason: input.reason.trim(),
      blockedById: input.blockedById,
    },
  });
}

/** Lets them back, with a reason. The block row stays as history. */
export async function releaseBlock(
  tx: Tx,
  input: { companyId: string; blockId: string; reason: string; releasedById: string }
) {
  if (!input.reason.trim()) throw new Error('سبب فك الحظر إلزامي');

  const block = await tx.customerBlock.findFirst({
    where: { id: input.blockId, companyId: input.companyId },
    select: { id: true, releasedAt: true },
  });
  if (!block) throw new Error('الحظر غير موجود');
  if (block.releasedAt) throw new Error('الحظر مفكوك مسبقاً');

  return tx.customerBlock.update({
    where: { id: block.id },
    data: {
      releasedAt: new Date(),
      releasedById: input.releasedById,
      releaseReason: input.reason.trim(),
    },
  });
}
