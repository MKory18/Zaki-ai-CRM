import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import { adapterFor, AD_PLATFORMS } from '@/lib/ads';
import { DISCONNECTED, isManualAccount, newManualAccountId } from '@/lib/ads/manual';

/**
 * ADDING AN AD ACCOUNT BY HAND — «ادخال يدوي بالكامل».
 *
 * The other half of `POST /api/settings/ad-accounts`, which connects one. A
 * manual account has a platform and a name, and optionally the platform's own
 * id; it has NO token, makes NO call, and is never read by the sync. Its
 * campaigns keep the spend the seller types — see `lib/ads/manual.ts`.
 *
 * A SEPARATE ROUTE, NOT A BRANCH IN THE CONNECT ONE. The connect route is a
 * strict chain — encryption must be configured, credentials must match what
 * the adapter asks for, the platform is asked before anything is stored — and
 * a `mode` flag in the middle of it would put a way to skip every one of those
 * steps one boolean away. Here there is no secret, so there is nothing to
 * encrypt, nothing to verify and no reason for any of them to be present.
 *
 * NO TOKEN CAN ARRIVE: the schema does not name one, and zod drops keys it
 * does not name, so a client that sends `credentials` anyway has them ignored
 * rather than stored. The row is written from `DISCONNECTED`, which is the
 * same object the switch-to-manual endpoint writes.
 *
 * Per store, like every ad account: it belongs to one brand, and a campaign
 * counted under another brand's account would divide one shop's spend by
 * another shop's orders.
 */

const manualSchema = z.object({
  platform: z.enum(AD_PLATFORMS as [string, ...string[]]),
  accountName: z.string().trim().min(2, 'اسم الحساب مطلوب').max(80, 'اسم الحساب طويل'),
  /** The platform's own id, when the seller has it. Optional: they may not, and need not. */
  accountId: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.manage');
    if (!storeId) {
      return NextResponse.json({ error: 'اختر متجراً أولاً — الحساب الإعلاني يخص متجراً بعينه' }, { status: 400 });
    }

    const parsed = manualSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { platform, accountName } = parsed.data;

    const adapter = adapterFor(platform);
    if (!adapter) return NextResponse.json({ error: 'منصة غير مدعومة' }, { status: 400 });

    // The platform's id, in the platform's own shape (`act_` on Meta) — the
    // same normalisation the connect route applies, so the two cannot disagree
    // about whether `123` and `act_123` are one account. Without one, a
    // made-up id that says what it is.
    let accountId: string;
    if (parsed.data.accountId) {
      const normalized = adapter.normalizeAccountId(parsed.data.accountId);
      if (!normalized) return NextResponse.json({ error: 'رقم الحساب الإعلاني غير صالح' }, { status: 400 });
      accountId = normalized;
    } else {
      accountId = newManualAccountId();
    }

    // Refused, not merged: an account that is already connected is somebody
    // having a working connection, and quietly replacing it with an empty one
    // would drop its token on the floor. Switching is its own, explicit act.
    const taken = await db.adAccount.findFirst({
      where: { companyId, storeId, platform, accountId },
      select: { id: true, status: true },
    });
    if (taken) {
      return NextResponse.json(
        {
          error: isManualAccount(taken)
            ? 'هذا الحساب مضاف يدوياً من قبل.'
            : 'هذا الحساب مربوط تلقائياً أصلاً — إن أردته يدوياً فاستعمل «حوّله إلى يدوي» من بطاقته.',
        },
        { status: 409 }
      );
    }

    const saved = await db.adAccount.create({
      data: { companyId, storeId, platform, accountId, accountName, createdById: user.id, ...DISCONNECTED },
      select: { id: true, platform: true, accountId: true, accountName: true, status: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'AD_ACCOUNT_ADDED_MANUAL',
      entity: 'AdAccount',
      entityId: saved.id,
      newData: { platform, accountId, accountName },
    });

    return NextResponse.json({ success: true, account: saved });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
