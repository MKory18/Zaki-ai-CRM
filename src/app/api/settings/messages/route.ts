import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import { saveTemplates, templatesFor, TEMPLATE_VARS } from '@/lib/message-templates';

/**
 * GET/PUT /api/settings/messages — the sentences sent to customers.
 *
 * Reading them needs no special permission: the tracking screen loads them
 * on every visit, and an agent who cannot read the list cannot send
 * anything. Writing them is settings work.
 */

const schema = z.object({
  templates: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        name: z.string().trim().min(2).max(60),
        channel: z.enum(['SMS', 'WHATSAPP', 'BOTH']),
        body: z.string().trim().min(5).max(1000),
      })
    )
    .max(40),
});

export async function GET() {
  try {
    const { companyId } = await requireContext();
    return NextResponse.json({
      templates: await templatesFor(companyId),
      vars: TEMPLATE_VARS,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('settings.manage');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    // Two templates sharing an id would make the picker send the wrong one.
    const ids = parsed.data.templates.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'يوجد قالبان بنفس المعرّف', code: 'DUPLICATE_ID' }, { status: 400 });
    }

    const saved = await saveTemplates(companyId, parsed.data.templates);

    await logAudit({
      companyId,
      userId: user.id,
      action: 'MESSAGE_TEMPLATES_UPDATED',
      entity: 'Company',
      entityId: companyId,
      newData: { count: saved.length, names: saved.map((t) => t.name) },
    });

    return NextResponse.json({ templates: saved });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
