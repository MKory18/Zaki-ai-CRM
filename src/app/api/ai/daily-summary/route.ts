import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { getCompanyAnalytics } from '@/lib/analytics';
import { generateAiBusinessAnalysis } from '@/lib/ai';
import { requirePermission } from '@/lib/authorization';

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();

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
    const { companyId } = await requireCompanyTenant();
    await requirePermission('ai.use');

    const todayStr = new Date().toISOString().split('T')[0];

    // Compute real analytics first
    const analytics = await getCompanyAnalytics(companyId, { period: 'all' });
    const aiContext = analytics.aiContext;

    // Call AI analyzer
    const analysis = await generateAiBusinessAnalysis(aiContext);

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
