import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext, seesAllCountries } from '@/lib/geo-context';
import { getCompanyAnalytics } from '@/lib/analytics';
import { generateAiBusinessAnalysis } from '@/lib/ai';
import { can, requirePermission } from '@/lib/authorization';
import type { SessionUser } from '@/types/auth';

/**
 * WHO MAY READ THE EXECUTIVE SUMMARY — AND WHY IT IS ALL OR NOTHING.
 *
 * The summary is ONE row per company and day, written from the money of
 * every store: revenue, cost of goods, commission, expenses, net profit.
 * Reading it asked for nothing at all — any signed-in person, the warehouse
 * included, could open this address and read the company's profit. Writing
 * it asked only for «استخدام المساعد الذكي», and a confirmation agent who
 * pressed «أعد توليد الملخّص» saw every store's figures and sent them to
 * the provider.
 *
 * Its words are written FROM those figures, so there is nothing to strip
 * afterwards: a sentence that says «صافي الربح ٤٬٢٠٠» is the figure. So
 * the row is for the person who sees the money and every store — the
 * finance key and every country — and anyone else is told why, and the row
 * is never read for them.
 */
const SUMMARY_REASON_AR = 'الملخّص التنفيذي مبني على أرقام المال للشركة كلها، ويحتاج «عرض المالية» ودخول كل المتاجر.';

function maySeeSummary(user: SessionUser): boolean {
  return can(user, 'finance.view') && seesAllCountries(user);
}

export async function GET() {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('ai.use');
    if (!maySeeSummary(user)) {
      return NextResponse.json({ summary: null, reasonAr: SUMMARY_REASON_AR });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    let summary = await db.aiDailySummary.findUnique({
      where: {
        companyId_date: {
          companyId,
          date: todayStr,
        },
      },
    });

    if (!summary) {
      // Find latest available
      summary = await db.aiDailySummary.findFirst({
        where: { companyId },
        orderBy: { date: 'desc' },
      });
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST() {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('ai.use');
    // Before anything is counted or sent anywhere.
    if (!maySeeSummary(user)) {
      return NextResponse.json({ error: SUMMARY_REASON_AR, errorAr: SUMMARY_REASON_AR }, { status: 403 });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Compute real analytics first
    const analytics = await getCompanyAnalytics({ companyId, storeId: null }, { period: 'all' });
    const aiContext = analytics.aiContext;

    // Call AI analyzer
    const analysis = await generateAiBusinessAnalysis(aiContext, companyId);

    // Upsert into AiDailySummary table
    const summary = await db.aiDailySummary.upsert({
      where: {
        companyId_date: {
          companyId,
          date: todayStr,
        },
      },
      update: {
        summaryText: analysis.summary,
        metricsJson: JSON.stringify(aiContext),
        observations: JSON.stringify(analysis.observations),
        risks: JSON.stringify(analysis.risks),
        recommendations: JSON.stringify(analysis.recommendations),
      },
      create: {
        companyId,
        date: todayStr,
        summaryText: analysis.summary,
        metricsJson: JSON.stringify(aiContext),
        observations: JSON.stringify(analysis.observations),
        risks: JSON.stringify(analysis.risks),
        recommendations: JSON.stringify(analysis.recommendations),
      },
    });

    return NextResponse.json({ success: true, summary, analysis, metrics: aiContext });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
