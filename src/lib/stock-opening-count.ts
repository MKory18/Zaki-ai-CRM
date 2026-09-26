import type { Prisma } from '@prisma/client';
import type { db as prismaDb } from './db';
import { receiveStock } from './receiving';

type Tx = Prisma.TransactionClient | typeof prismaDb;

export class OpeningStockRefused extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface OpeningStockLine {
  productId: string;
  countedQty: number;
  /** Cost of one unit. See the zero-cost rule below. */
  unitCost: number;
  /** Required only to allow a zero cost, and it must say why. */
  zeroCostReason?: string | null;
}

/**
 * THE SIGNED PHYSICAL COUNT OF STOCK A STORE STARTED FROM.
 *
 * WHAT ALREADY EXISTED AND IS NOT REBUILT. A physical count is already a
 * thing here: the «الجرد» door on `/api/inventory` takes a counted quantity
 * and a written reason, computes the difference against on-hand, and enters
 * any surplus at the cost of the stock already there rather than at zero —
 * its own comment says why, and that reasoning is borrowed below. Units live
 * in `ProductionBatch.quantityRemaining` and nowhere else, so this function
 * puts them there through `receiveStock` like every other intake. Inventing a
 * second place stock can live is how a balance screen and a shipment screen
 * come to disagree.
 *
 * WHAT WAS MISSING. Two things. Who counted — the recount door records a
 * reason but not a counter, and the audit log holds the logged-in user, who
 * is not the person holding the shelf. And the notion that one particular
 * count is the one the business STARTED from, which is what the cutover
 * signs for.
 *
 * THERE IS NO WAREHOUSE IN THIS SYSTEM. The contract says «stock per
 * warehouse» and no `Warehouse` model exists; stock belongs to a STORE, and a
 * store here is a separate business with its own shelf. So this is one count
 * per store, which for the launch scope is one count for صحة بلس. Reported,
 * not resolved.
 *
 * WHY A ZERO UNIT COST IS REFUSED UNLESS IT IS EXPLAINED. Cost is captured
 * when stock arrives, and everything sold out of a zero-cost batch reports
 * pure profit for ever — there is no later correction, because the cost of a
 * sold unit was read at the moment it sold. The recount door already refuses
 * to do this silently. A free sample is real, so the door is not shut: it
 * asks for a sentence.
 */
export async function recordOpeningStockCount(
  tx: Tx,
  input: {
    companyId: string;
    storeId: string;
    countedByName: string;
    countedAt: Date;
    lines: OpeningStockLine[];
    note?: string | null;
    recordedById: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();

  const existing = await tx.stockOpeningCount.findUnique({
    where: { storeId: input.storeId },
    select: { countedByName: true, countedAt: true },
  });
  if (existing) {
    throw new OpeningStockRefused(
      'ALREADY_COUNTED',
      `عُدَّ مخزون هذا المتجر مرّةً بمعرفة ${existing.countedByName} في ` +
        `${existing.countedAt.toISOString().slice(0, 10)}. العدُّ الافتتاحيُّ يُسجَّل مرّةً واحدة.`
    );
  }

  // A store whose stock has already moved is reconciled by the recount door,
  // which exists and compares against on-hand. An "opening" count taken after
  // the first sale is not an opening balance, it is a stocktake.
  const moved = await tx.inventoryMovement.count({ where: { companyId: input.companyId, storeId: input.storeId } });
  if (moved > 0) {
    throw new OpeningStockRefused(
      'STOCK_HAS_MOVED',
      `لهذا المتجر ${moved} حركة مخزون — والعدُّ بعد أوّل حركةٍ جردٌ لا رصيدٌ افتتاحيّ. ` +
        'استعمل «الجرد» في شاشة أرصدة المخزون، فهو يقارن بالمتاح ويطلب سبباً مكتوباً.'
    );
  }

  const countedByName = input.countedByName.trim();
  if (countedByName.length < 3) {
    throw new OpeningStockRefused('NO_COUNTER', 'اسم من عدَّ المخزون مطلوب — العدُّ بلا اسمٍ ليس عدّاً موقَّعاً');
  }

  if (input.countedAt.getTime() > now.getTime() + 60_000) {
    throw new OpeningStockRefused('COUNT_IN_FUTURE', 'وقت العدّ في المستقبل');
  }

  if (input.lines.length === 0) {
    throw new OpeningStockRefused('NO_LINES', 'العدّ بلا بنود');
  }

  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.productId)) {
      throw new OpeningStockRefused('DUPLICATE_PRODUCT', 'منتج مذكور مرّتين في العدّ — أيُّ الكمّيتين هي المعدودة؟');
    }
    seen.add(line.productId);

    if (!Number.isInteger(line.countedQty) || line.countedQty < 0) {
      throw new OpeningStockRefused('QUANTITY_INVALID', 'الكمية المعدودة يجب أن تكون عدداً صحيحاً غير سالب');
    }
    if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
      throw new OpeningStockRefused('COST_INVALID', 'كلفة الوحدة غير صالحة');
    }
    if (line.unitCost === 0 && (line.zeroCostReason?.trim().length ?? 0) < 5) {
      throw new OpeningStockRefused(
        'ZERO_COST_UNEXPLAINED',
        'كلفة وحدةٍ بصفر تجعل كلَّ ما يُباع منها ربحاً صافياً إلى الأبد، والكلفة تُلتقط لحظة الدخول ' +
          'فلا تصحيح بعدها. إن كانت صفراً حقّاً فاكتب السبب.'
      );
    }
  }

  // Every product must be this store's. A product id in a request body is a
  // foreign key somebody can type.
  const products = await tx.product.findMany({
    where: { id: { in: [...seen] }, companyId: input.companyId, storeId: input.storeId },
    select: { id: true, name: true },
  });
  if (products.length !== seen.size) {
    const found = new Set(products.map((p) => p.id));
    const missing = [...seen].filter((id) => !found.has(id));
    throw new OpeningStockRefused(
      'PRODUCT_NOT_IN_STORE',
      `${missing.length} منتجاً ليس من منتجات هذا المتجر — العدُّ لا يضع بضاعةً على رفِّ متجرٍ آخر`
    );
  }

  const count = await tx.stockOpeningCount.create({
    data: {
      companyId: input.companyId,
      storeId: input.storeId,
      countedByName,
      countedAt: input.countedAt,
      note: input.note?.trim() || null,
      recordedById: input.recordedById,
    },
  });

  // Units go in the ONE place units live. A counted zero is recorded as a
  // line of the count and opens no batch: there is nothing to put on a shelf,
  // and a zero-quantity batch would sit in every FIFO draw-down for ever.
  const placed: { productId: string; qty: number; batchNumber: string | null }[] = [];
  for (const line of input.lines) {
    if (line.countedQty === 0) {
      placed.push({ productId: line.productId, qty: 0, batchNumber: null });
      continue;
    }
    const { batch } = await receiveStock(tx, {
      companyId: input.companyId,
      storeId: input.storeId,
      productId: line.productId,
      quantity: line.countedQty,
      unitCost: line.unitCost,
      note: `العدّ الافتتاحيّ — عدَّه ${countedByName}${line.zeroCostReason ? ` · ${line.zeroCostReason.trim()}` : ''}`,
      createdById: input.recordedById,
    });
    await tx.productionBatch.update({ where: { id: batch.id }, data: { openingCountId: count.id } });
    placed.push({ productId: line.productId, qty: line.countedQty, batchNumber: batch.batchNumber });
  }

  return { count, placed, products };
}
