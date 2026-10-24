import type { PrismaClient } from '@prisma/client';
import { logAudit } from '../../src/lib/audit';
import { STORE_NAMES, WALLETS } from './catalog';

/**
 * يضيف محافظ `catalog.ts` لمتجر واحد بالاسم.
 *
 *   • تجربة بلا كتابة هي الافتراضي؛ الكتابة مع `--apply` فقط.
 *   • إعادة التشغيل آمنة: المحفظة الموجودة بنفس الاسم بنفس المتجر تُترك كما هي (لا تتكرر ولا تتغير عملتها).
 *   • لا يحذف ولا يعدّل شيئاً. كل محفظة جديدة تُسجَّل `WALLET_CREATED` بسجل التدقيق كأنها أُنشئت من الشاشة.
 *   • إن لم يجد المتجر أو وجد أكثر من واحد يتوقف.
 */
export interface Deps {
  db: PrismaClient;
  log: (line: string) => void;
}

export interface WalletsReport {
  store: string;
  created: string[];
  kept: string[];
  warnings: string[];
}

export async function applyWallets(deps: Deps, opts: { apply: boolean }): Promise<WalletsReport> {
  const { db, log } = deps;
  const stores = await db.store.findMany({
    where: { name: { in: STORE_NAMES } },
    select: { id: true, companyId: true, countryId: true, name: true },
  });
  if (stores.length !== 1) {
    throw new Error(`وجدت ${stores.length} متجر بالأسماء ${STORE_NAMES.join(' / ')} — لازم واحد بالضبط، توقفت.`);
  }
  const store = stores[0];
  log(`${opts.apply ? 'تطبيق' : 'تجربة'} على المتجر «${store.name}»`);

  const report: WalletsReport = { store: store.name, created: [], kept: [], warnings: [] };
  for (const spec of WALLETS) {
    const have = await db.wallet.findFirst({
      where: { companyId: store.companyId, storeId: store.id, name: spec.name },
      select: { id: true, currencyCode: true },
    });
    if (have) {
      report.kept.push(spec.name);
      if (have.currencyCode !== spec.currencyCode) {
        const w = `«${spec.name}» موجودة بعملة ${have.currencyCode} ومطلوبة ${spec.currencyCode} — تُركت كما هي (العملة لا تتغير)`;
        report.warnings.push(w);
        log(`⚠️  ${w}`);
      } else {
        log(`= ${spec.name} (${spec.currencyCode}) موجودة`);
      }
      continue;
    }
    if (!opts.apply) {
      report.created.push(spec.name);
      log(`+ ${spec.name} (${spec.currencyCode}) ستُضاف`);
      continue;
    }
    const wallet = await db.wallet.create({
      data: {
        companyId: store.companyId,
        countryId: store.countryId,
        storeId: store.id,
        name: spec.name,
        currencyCode: spec.currencyCode,
        openingBalance: 0,
      },
    });
    await logAudit({
      companyId: store.companyId,
      userId: null,
      action: 'WALLET_CREATED',
      entity: 'Wallet',
      entityId: wallet.id,
      newData: { name: wallet.name, currency: wallet.currencyCode, opening: 0, via: 'scripts/apply-wallets' },
    });
    report.created.push(spec.name);
    log(`+ ${spec.name} (${spec.currencyCode}) أُضيفت`);
  }
  return report;
}
