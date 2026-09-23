import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { generateWebhookToken, hashWebhookToken, webhookUrl } from '@/lib/couriers/webhook-token';

/**
 * The courier's webhook URL: created here, shown once, never readable again.
 *
 * GET  — whether one exists and when it last carried traffic. Never the URL.
 * POST — mint a new one and return it, this once. Any previous URL stops
 *        working the moment this returns, so the new one has to reach the
 *        courier before their next push.
 *
 * Treating it as unreadable is the whole point: the URL is a credential, and
 * the same rule already governs this courier's password one field away.
 */

function originOf(req: Request): string {
  // Behind a proxy the public host is in the forwarded headers; the request
  // URL would say "localhost" and we would hand the courier a dead address.
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await params;

    const provider = await db.deliveryProvider.findFirst({
      where: { id, companyId },
      select: { webhookSecretHash: true, webhookSecretSetAt: true, webhookLastSeenAt: true },
    });
    if (!provider) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    return NextResponse.json({
      configured: Boolean(provider.webhookSecretHash),
      setAt: provider.webhookSecretSetAt,
      lastSeenAt: provider.webhookLastSeenAt,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await params;

    const provider = await db.deliveryProvider.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, webhookSecretHash: true },
    });
    if (!provider) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    const token = generateWebhookToken();
    await db.deliveryProvider.update({
      where: { id: provider.id },
      data: {
        webhookSecretHash: hashWebhookToken(token),
        webhookSecretSetAt: new Date(),
        webhookLastSeenAt: null, // a new URL has not been used yet
      },
    });

    // The URL is NOT logged — only that one was minted, and whether it
    // replaced an older one that has now stopped working.
    await logAudit({
      companyId,
      userId: user.id,
      action: provider.webhookSecretHash ? 'COURIER_WEBHOOK_REGENERATED' : 'COURIER_WEBHOOK_CREATED',
      entity: 'DeliveryProvider',
      entityId: provider.id,
      newData: { courier: provider.name },
    });

    return NextResponse.json({ url: webhookUrl(originOf(req), token) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
