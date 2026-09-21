import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { agentCustody, allAgentCustody } from '@/lib/agent-custody';

/**
 * GET /api/finance/agents           every agent's custody
 * GET /api/finance/agents?id=…      one agent, with the orders behind it
 *
 * Read-only by design. Nothing here moves money: receiving from an agent is
 * a settlement, and a settlement goes through the statement → receipt →
 * approval chain like every other one, so that the guards that protect the
 * company's cash are not bypassed by a screen that happens to be about a
 * person rather than a company.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.view');

    const scope = {
      companyId,
      storeId,
      minorUnit: country.minorUnit,
      currencyCode: country.currencyCode,
    };

    const id = new URL(req.url).searchParams.get('id')?.trim();
    if (id) {
      const custody = await agentCustody(db, id, scope);
      if (!custody) return NextResponse.json({ error: 'المندوب غير موجود' }, { status: 404 });
      return NextResponse.json({ custody });
    }

    const agents = await allAgentCustody(db, scope);
    return NextResponse.json({
      currencyCode: country.currencyCode,
      agents: agents.map((a) => ({ agent: a.agent, totals: a.totals })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
