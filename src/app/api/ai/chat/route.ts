import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireContext } from '@/lib/geo-context';
import { getCompanyAnalytics } from '@/lib/analytics';
import { askAiAssistant } from '@/lib/ai';
import { requirePermission } from '@/lib/authorization';

export async function POST(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('ai.use');

    const body = await req.json();
    const { question, period = 'all' } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Pull ground-truth analytics first
    const analytics = await getCompanyAnalytics({ companyId, storeId }, { period });
    const answer = await askAiAssistant(question, analytics.aiContext, companyId);

    return NextResponse.json({
      success: true,
      answer,
      context: analytics.aiContext,
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
