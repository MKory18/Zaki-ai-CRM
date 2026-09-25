import { db } from '@/lib/db';
import { can } from '@/lib/authorization';
import { allowedScopes, scopeContext } from '@/lib/ai-scope';
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireContext } from '@/lib/geo-context';
import { getCompanyAnalytics } from '@/lib/analytics';
import { askAiAssistant } from '@/lib/ai';
import { requirePermission } from '@/lib/authorization';

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('ai.use');

    const body = await req.json();
    const { question, period = 'all' } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Pull ground-truth analytics first
    const analytics = await getCompanyAnalytics({ companyId, storeId }, { period });

    // WHAT THIS PERSON MAY SEE — removed here, not asked for politely.
    //
    // The whole business used to go into the request: revenue, cost of
    // goods, commission, net profit. Anyone holding ai.use — a key granted
    // so people could ask about their own orders — could ask how much the
    // company made, and be told. Including the people whose own commission
    // is a line in that answer.
    const allowed = allowedScopes(['orders', 'finance', 'team'], (p) => can(user, p));
    const { context, removed } = scopeContext(analytics.aiContext, allowed);

    const store = await db.store.findFirst({
      where: { id: storeId, companyId },
      select: { country: { select: { currencyCode: true } } },
    });

    const answer = await askAiAssistant(question, context, {
      companyId,
      removed,
      currency: store?.country.currencyCode ?? '',
    });

    return NextResponse.json({
      success: true,
      answer,
      // The same narrowed context the model was given — a screen showing
      // the full one beside a narrowed answer would hand back what the
      // filter just removed.
      context,
      removed,
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
