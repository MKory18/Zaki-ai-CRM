import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can, requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { walletBalance } from '@/lib/wallets';

/**
 * Wallets.
 *
 *   GET  /api/finance/wallets    every wallet of the company with its balance
 *   POST /api/finance/wallets    create one
 *
 * A wallet belongs to a COUNTRY and carries its own currency, which may
 * differ from the country's. There is no delete: a wallet is deactivated,
 * because its movements are permanent records.
 */

const createSchema = z.object({
  countryId: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'رمز العملة ثلاثة أحرف'),
  openingBalance: z.number().min(-1_000_000_000).max(1_000_000_000).default(0),
});

export async function GET() {
  try {
    const { user, companyId, country } = await requireContext();
    // Settlement records WHICH wallet a courier payment landed in, so it needs
    // the list of wallets — but not the cashbox figures. Only finance.cashbox
    // sees balances.
    const cashbox = can(user, 'finance.cashbox');
    if (!cashbox) await requirePermission('settlement.upload');

    const wallets = await db.wallet.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { country: { select: { id: true, name: true, code: true, minorUnit: true } } },
    });

    if (!cashbox) {
      return NextResponse.json({
        wallets: wallets.map((w) => ({
          id: w.id,
          name: w.name,
          currencyCode: w.currencyCode,
          isActive: w.isActive,
          country: w.country,
        })),
      });
    }

    const balances = await Promise.all(
      wallets.map((w) => walletBalance(db, w.id, w.country.minorUnit ?? country.minorUnit))
    );

    return NextResponse.json({
      wallets: wallets.map((w, i) => ({
        ...balances[i],
        id: w.id,
        name: w.name,
        // The wallet's own currency wins over the balance echo of it.
        currencyCode: w.currencyCode,
        isActive: w.isActive,
        country: w.country,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const country = await db.country.findFirst({
      where: { id: parsed.data.countryId, companyId },
      select: { id: true, name: true },
    });
    if (!country) return NextResponse.json({ error: 'البلد غير موجود' }, { status: 404 });

    const clash = await db.wallet.findFirst({ where: { companyId, name: parsed.data.name }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'يوجد محفظة بنفس الاسم' }, { status: 409 });

    const wallet = await db.wallet.create({
      data: {
        companyId,
        countryId: country.id,
        name: parsed.data.name,
        currencyCode: parsed.data.currencyCode,
        openingBalance: parsed.data.openingBalance,
      },
    });

    await logAudit({
      companyId, userId: user.id, action: 'WALLET_CREATED',
      entity: 'Wallet', entityId: wallet.id,
      newData: { name: wallet.name, currency: wallet.currencyCode, country: country.name, opening: parsed.data.openingBalance },
    });

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
