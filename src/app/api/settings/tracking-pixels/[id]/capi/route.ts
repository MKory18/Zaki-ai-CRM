import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { encryptSecret, encryptionAvailable, secretHint } from '@/lib/secrets';
import { maskPixelId } from '@/lib/tracking/tracking-types';
import { verifyPixelToken, explainCapiError } from '@/lib/conversions/meta-capi';

/**
 * THE CONVERSIONS API TOKEN FOR ONE PIXEL.
 *
 * The browser half of this pixel still stores nothing but an id, because
 * anything a page holds travels through the customer's own browser. This is
 * the server half, and it cannot speak to Meta without a token.
 *
 * WRITE-ONLY, under the same law as the courier logins and the ad-account
 * secrets: verified against Meta before it is stored, encrypted on the way
 * in, never returned by this or any endpoint, and never written to an audit
 * entry — an audit log is read by more people than a settings screen. Only
 * the last four characters come back.
 *
 * Verified BEFORE storing, and it matters here more than anywhere: nothing
 * about this feature is visible until an order reaches a moment days later,
 * inside a worker, at an hour nobody is watching.
 */

const schema = z.object({
  token: z.string().trim().min(20).max(600).optional(),
  /**
   * Meta's Test Events code. Empty string clears it, which is the whole
   * point: an event carrying it is visible in the test panel and NOT
   * counted as a conversion, so one left switched on means a seller sees
   * events arriving and no conversions ever recorded.
   */
  testCode: z.string().trim().max(40).optional(),
  /** true removes the token and turns this pixel back into a browser-only one. */
  remove: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const pixel = await db.trackingPixel.findFirst({
      where: { id, companyId },
      select: { id: true, platform: true, name: true, pixelId: true },
    });
    if (!pixel) return NextResponse.json({ error: 'البكسل غير موجود' }, { status: 404 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'الرمز غير صالح' }, { status: 400 });
    }
    const { token, testCode, remove } = parsed.data;

    if (remove) {
      // The conversions themselves survive. They simply stop being sent,
      // and their history of what was already sent stays readable.
      await db.trackingPixel.update({
        where: { id },
        data: { capiToken: null, capiTokenHint: null, capiTestCode: null },
      });
      await logAudit({
        companyId,
        userId: user.id,
        action: 'TRACKING_PIXEL_CAPI_REMOVED',
        entity: 'TrackingPixel',
        entityId: id,
        previousData: { name: pixel.name, pixelId: maskPixelId(pixel.pixelId), by: user.name },
      });
      return NextResponse.json({ success: true, removed: true });
    }

    // The test code alone, without touching the token.
    if (token === undefined) {
      if (testCode === undefined) {
        return NextResponse.json({ error: 'لا شيء لتغييره' }, { status: 400 });
      }
      await db.trackingPixel.update({ where: { id }, data: { capiTestCode: testCode || null } });
      return NextResponse.json({ success: true, testCode: testCode || null });
    }

    if (pixel.platform !== 'META') {
      // TikTok and Snapchat have their own Events APIs with different
      // shapes. Accepting a token we cannot use would be a connection that
      // looks made and sends nothing.
      return NextResponse.json(
        { error: 'واجهة التحويلات متاحة لميتا فقط حالياً' },
        { status: 400 }
      );
    }

    if (!encryptionAvailable()) {
      // Storing a token in the clear is not a degraded mode, it is a leak
      // waiting for the first database dump.
      return NextResponse.json(
        { error: 'التشفير غير مُهيأ على الخادم (ENCRYPTION_KEY). لا يمكن حفظ رمز بدونه.' },
        { status: 500 }
      );
    }

    // Try it before trusting it.
    let name: string;
    try {
      ({ name } = await verifyPixelToken(pixel.pixelId, token));
    } catch (e) {
      return NextResponse.json({ error: explainCapiError(e) }, { status: 400 });
    }

    await db.trackingPixel.update({
      where: { id },
      data: {
        capiToken: encryptSecret(token),
        capiTokenHint: secretHint(token),
        ...(testCode !== undefined ? { capiTestCode: testCode || null } : {}),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'TRACKING_PIXEL_CAPI_CONNECTED',
      entity: 'TrackingPixel',
      entityId: id,
      // The pixel and who did it. Never the token, not even its hint.
      newData: { name: pixel.name, pixelId: maskPixelId(pixel.pixelId), metaName: name, by: user.name },
    });

    return NextResponse.json({ success: true, metaName: name, hint: secretHint(token) });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
