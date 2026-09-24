import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { inStore } from '@/lib/store-filter';
import { encryptSecret, encryptionAvailable, secretHint } from '@/lib/secrets';
import { verifyAccount, normalizeAccountId, explainMetaError } from '@/lib/ads/meta';

/**
 * CONNECTING AN AD ACCOUNT.
 *
 * The token is WRITE-ONLY. It is checked against the platform before it is
 * stored, encrypted on the way in, never returned by this or any endpoint,
 * and never written to an audit entry — the same rule the courier logins
 * and the AI key follow. Only a four-character hint comes back, so a seller
 * can tell which token is in there.
 *
 * Checked BEFORE it is stored, and this matters: a token saved untried is a
 * token that fails at 3am inside a scheduled sync, where the error goes to
 * a log instead of to the screen of the person who could fix it.
 *
 * Per store. An ad account belongs to one brand and its spend belongs to
 * that brand's campaigns; a figure pulled into the wrong shop is worse than
 * no figure at all.
 */

const connectSchema = z.object({
  platform: z.literal('META').default('META'),
  accountId: z.string().trim().min(5).max(40),
  token: z.string().trim().min(20).max(500),
});

export async function GET() {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('settings.view');

    const accounts = await db.adAccount.findMany({
      where: inStore(companyId, storeId),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, platform: true, accountId: true, accountName: true,
        tokenHint: true, status: true, lastError: true, lastSyncAt: true,
        // NEVER tokenEncrypted. Not selected rather than selected-and-dropped:
        // a field that is never read cannot be accidentally serialised.
        _count: { select: { campaigns: true } },
      },
    });

    return NextResponse.json({ accounts });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.manage');
    if (!storeId) {
      return NextResponse.json({ error: 'اختر متجراً أولاً — الحساب الإعلاني يخص متجراً بعينه' }, { status: 400 });
    }

    if (!encryptionAvailable()) {
      // Storing a token in the clear is not a degraded mode, it is a leak
      // waiting for the first database dump.
      return NextResponse.json(
        { error: 'التشفير غير مُهيأ على الخادم (ENCRYPTION_KEY). لا يمكن حفظ رمز بدونه.' },
        { status: 500 }
      );
    }

    const parsed = connectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'رقم الحساب أو الرمز غير صالح' }, { status: 400 });
    }
    const { platform, accountId, token } = parsed.data;

    const normalized = normalizeAccountId(accountId);
    if (!normalized) {
      return NextResponse.json({ error: 'رقم الحساب الإعلاني غير صالح' }, { status: 400 });
    }

    // Try it before trusting it.
    let account;
    try {
      account = await verifyAccount(token, normalized);
    } catch (e) {
      return NextResponse.json({ error: explainMetaError(e) }, { status: 400 });
    }

    const saved = await db.adAccount.upsert({
      where: {
        companyId_storeId_platform_accountId: {
          companyId, storeId, platform, accountId: normalized,
        },
      },
      create: {
        companyId, storeId, platform,
        accountId: normalized,
        accountName: account.name,
        tokenEncrypted: encryptSecret(token),
        tokenHint: secretHint(token),
        status: 'CONNECTED',
        createdById: user.id,
      },
      update: {
        accountName: account.name,
        tokenEncrypted: encryptSecret(token),
        tokenHint: secretHint(token),
        status: 'CONNECTED',
        lastError: null,
      },
      select: { id: true, accountId: true, accountName: true, tokenHint: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'AD_ACCOUNT_CONNECTED',
      entity: 'AdAccount',
      entityId: saved.id,
      // The account and who did it. Never the token, not even its hint —
      // an audit log is read by more people than a settings screen.
      newData: { platform, accountId: normalized, accountName: account.name },
    });

    return NextResponse.json({
      success: true,
      account: saved,
      // Said plainly, because a disabled account connects fine and then
      // reports nothing, and the seller would blame us.
      warning: account.active ? null : 'الحساب الإعلاني موقوف لدى ميتا — سيتصل لكنه لن يعطي أرقاماً.',
      currency: account.currency,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
