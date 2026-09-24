import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { inStore } from '@/lib/store-filter';
import { getDateRange, type DateFilter } from '@/lib/analytics';
import { campaignPerformance } from '@/lib/attribution-performance';
import {
  campaignInputSchema,
  campaignResult,
  campaignLink,
  generateCampaignCode,
  datesMakeSense,
  wasRunning,
} from '@/lib/campaigns';
import { zodMessage } from '@/lib/zod-message';

/**
 * PAID CAMPAIGNS, AND WHAT CAME BACK FROM THEM.
 *
 * The list is two halves joined by the campaign id. The spend is what the
 * seller typed; everything else — orders, confirmations, deliveries, money
 * collected — is measured by the same attribution engine the moderator and
 * channel reports use, so the word "revenue" means one thing across every
 * screen in the system.
 *
 * Per store, like everything a store owns: a campaign runs for one shop,
 * and its spend must never be divided by another shop's orders.
 */

export async function GET(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('reports.view').catch(async () => requirePermission('analytics.view'));

    const q = new URL(req.url).searchParams;
    const filter: DateFilter = {
      period: (q.get('period') as DateFilter['period']) || undefined,
      startDate: q.get('startDate') || undefined,
      endDate: q.get('endDate') || undefined,
    };
    const { start, end } = getDateRange(filter);

    const [campaigns, rows] = await Promise.all([
      db.campaign.findMany({
        where: inStore(companyId, storeId),
        orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
        include: {
          landingPage: { select: { id: true, name: true, slug: true } },
          adAccount: { select: { id: true, accountName: true, accountId: true, status: true } },
        },
      }),
      campaignPerformance({ companyId, storeId: storeId ?? '', start, end }),
    ]);

    const byId = new Map(rows.map((r) => [r.id, r]));
    const store = storeId
      ? await db.store.findFirst({ where: { id: storeId, companyId }, select: { slug: true } })
      : null;
    const origin = new URL(req.url).origin;

    const list = campaigns.map((c) => {
      const row = byId.get(c.id) ?? null;
      const spend = Number(c.spend);
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        code: c.code,
        status: c.status,
        // Where the spend came from, said out loud. A number a person typed
        // and a number a machine pulled deserve to be told apart — not
        // least so nobody wonders why one of them changed overnight.
        spendSource: c.spendSource,
        adAccount: c.adAccount,
        externalId: c.externalId,
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
        notes: c.notes,
        landingPage: c.landingPage,
        link: campaignLink(
          origin,
          c.code,
          c.landingPage ? { kind: 'lp', slug: c.landingPage.slug } : { kind: 'store', slug: store?.slug ?? '' }
        ),
        // A campaign showing zero can then say WHY: no orders, or not even
        // running in the window being read.
        ranInWindow: wasRunning(c, start, end),
        funnel: row
          ? {
              brought: row.brought,
              confirmed: row.confirmed,
              rejected: row.rejected,
              delivered: row.delivered,
              returned: row.returned,
              confirmationRate: row.confirmationRate,
              deliveryRate: row.deliveryRate,
            }
          : { brought: 0, confirmed: 0, rejected: 0, delivered: 0, returned: 0, confirmationRate: null, deliveryRate: null },
        money: campaignResult(spend, row),
      };
    });

    // What the shop actually spent and made in the window, so the header is
    // not the seller adding up the column themselves.
    const totals = list.reduce(
      (t, c) => ({
        spend: t.spend + c.money.spend,
        revenue: t.revenue + c.money.revenue,
        brought: t.brought + c.funnel.brought,
        delivered: t.delivered + c.funnel.delivered,
      }),
      { spend: 0, revenue: 0, brought: 0, delivered: 0 }
    );

    return NextResponse.json({
      campaigns: list,
      totals: {
        ...campaignResult(totals.spend, { revenue: totals.revenue, brought: totals.brought, delivered: totals.delivered }),
        brought: totals.brought,
        delivered: totals.delivered,
      },
      currency: country.currencyCode,
      // So the screen can offer to link a campaign without a second request.
      adAccounts: await db.adAccount.findMany({
        where: inStore(companyId, storeId),
        select: { id: true, accountId: true, accountName: true, status: true },
      }),
      window: { start: start?.toISOString() ?? null, end: end?.toISOString() ?? null },
      definitions: {
        revenue: 'المحصَّل فعلاً حيث نعرفه، وإجمالي الطلب حيث لا نعرفه — نفس تعريف شاشة الأرباح',
        net: 'الإيراد ناقص الإنفاق الإعلاني فقط. ليس الربح: كلفة البضاعة والتوصيل والعمولة ليست هنا',
        roas: 'كم دولاراً عاد مقابل كل دولار أُنفق',
        costPerDelivered: 'كم كلّف الإعلان مقابل طلب واحد وصل فعلاً',
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('reports.view').catch(async () => requirePermission('analytics.view'));
    if (!storeId) {
      return NextResponse.json({ error: 'اختر متجراً أولاً — الحملة تخص متجراً بعينه' }, { status: 400 });
    }

    const parsed = campaignInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const input = parsed.data;

    if (!datesMakeSense(input.startDate, input.endDate ?? null)) {
      return NextResponse.json({ error: 'تاريخ الانتهاء قبل تاريخ البدء' }, { status: 400 });
    }

    // A page from another store would put this campaign's link on somebody
    // else's shop.
    if (input.landingPageId) {
      const lp = await db.landingPage.findFirst({
        where: { id: input.landingPageId, ...inStore(companyId, storeId) },
        select: { id: true },
      });
      if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة في هذا المتجر' }, { status: 400 });
    }

    // A seller may name the code; otherwise one is made. Either way it must
    // be free — a reused code would move old orders onto new spend.
    let code = input.code ?? generateCampaignCode();
    for (let attempt = 0; attempt < 8; attempt++) {
      const taken = await db.campaign.findFirst({
        where: { companyId, storeId, code },
        select: { id: true },
      });
      if (!taken) break;
      if (input.code) {
        return NextResponse.json({ error: `الرمز «${code}» مستخدم في حملة أخرى` }, { status: 400 });
      }
      code = generateCampaignCode();
    }

    const created = await db.campaign.create({
      data: {
        companyId,
        storeId,
        name: input.name,
        platform: input.platform,
        code,
        landingPageId: input.landingPageId ?? null,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        spend: input.spend,
        notes: input.notes ?? null,
        createdById: user.id,
      },
      select: { id: true, name: true, code: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CAMPAIGN_CREATED',
      entity: 'Campaign',
      entityId: created.id,
      newData: { name: created.name, code: created.code, platform: input.platform, spend: input.spend },
    });

    return NextResponse.json({ success: true, campaign: created });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
