import { NextResponse } from 'next/server';
import { requireCompanyTenant } from '@/lib/auth';
import { getCompanyAnalytics, DateFilter } from '@/lib/analytics';

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);

    const period = (searchParams.get('period') as any) || 'all';
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const filter: DateFilter = { period, startDate, endDate };
    const analytics = await getCompanyAnalytics(companyId, filter);

    return NextResponse.json(analytics);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
