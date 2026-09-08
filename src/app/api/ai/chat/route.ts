import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireCompanyTenant } from '@/lib/auth';
import { getCompanyAnalytics } from '@/lib/analytics';
import { askAiAssistant } from '@/lib/ai';
import { requirePermission } from '@/lib/authorization';

export async function POST(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('ai.use');

    const body = await req.json();
    const { question, period = 'all' } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Pull ground-truth analytics first
    const analytics = await getCompanyAnalytics(companyId, { period });
    const answer = await askAiAssistant(question, analytics.aiContext);

    return NextResponse.json({
      success: true,
      answer,
      context: analytics.aiContext,
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
