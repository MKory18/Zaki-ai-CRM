import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { courierScope } from '@/lib/courier-scope';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { decryptJson } from '@/lib/secrets';
import { logesTechsFromCredentials, type LogesTechsCredentials } from '@/lib/couriers/logestechs';

/**
 * POST — does the saved account actually work?
 *
 * "Saved" and "works" are different facts, and the screen could only report
 * the first. A typo in the password sits there looking fine until the first
 * real batch fails at dispatch, in front of parcels already packed.
 *
 * It asks the courier something harmless and read-only — their city list —
 * and reports whether the answer came back. It creates nothing, cancels
 * nothing and costs nothing.
 *
 * The password is never read by the caller. It is decrypted here, used for
 * one request, and the response says only whether it was accepted.
 */

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await params;

    const provider = await db.deliveryProvider.findFirst({
      where: { id, ...courierScope(companyId, storeId) },
      select: { id: true, name: true, adapterCode: true, code: true, apiCredentials: true },
    });
    if (!provider) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    if (!provider.apiCredentials) {
      return NextResponse.json({ ok: false, reason: 'NO_ACCOUNT', message: 'لا حساب محفوظ بعد.' });
    }

    const key = (provider.adapterCode || provider.code || '').trim().toUpperCase();
    if (key !== 'LOGESTECHS') {
      return NextResponse.json({
        ok: false,
        reason: 'NO_TEST',
        message: 'لا يوجد فحص آلي لهذه الشركة.',
      });
    }

    const stored = decryptJson<LogesTechsCredentials>(provider.apiCredentials);
    if (!stored) {
      // The row holds something we can no longer read — almost always a
      // changed encryption key. Saying so beats "wrong password".
      return NextResponse.json({
        ok: false,
        reason: 'UNREADABLE',
        message: 'تعذّر فكّ تشفير الحساب المحفوظ — غالباً تغيّر مفتاح التشفير. أعد إدخال الحساب.',
      });
    }

    const adapter = logesTechsFromCredentials(stored);
    if (!adapter) {
      return NextResponse.json({ ok: false, reason: 'INCOMPLETE', message: 'الحساب المحفوظ ناقص.' });
    }

    const started = Date.now();
    let result: { ok: boolean; reason: string; message: string };
    try {
      // Their city search: read-only, and the one call that proves both the
      // login and the network path in a single round trip.
      const cityId = await adapter.findCityId('عمان');
      result = cityId
        ? { ok: true, reason: 'OK', message: `الحساب يعمل — استجابت الشركة خلال ${Date.now() - started}ms.` }
        : {
            ok: true,
            reason: 'OK_NO_MATCH',
            message: `الحساب يعمل — استجابت الشركة خلال ${Date.now() - started}ms (لم تُطابق مدينة الاختبار، وهذا لا يعنينا).`,
          };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Their errors are English and shaped for a developer. Say what the
      // person can act on, and keep their words for the audit row.
      const rejected = /401|403|unauthor|invalid|credential|password/i.test(raw);
      result = {
        ok: false,
        reason: rejected ? 'REJECTED' : 'UNREACHABLE',
        message: rejected
          ? 'الشركة رفضت الحساب — راجع اسم المستخدم وكلمة المرور ورقم الشركة.'
          : 'تعذّر الوصول إلى الشركة — قد تكون خدمتهم متوقفة أو الشبكة محجوبة.',
      };
      await logAudit({
        companyId,
        userId: user.id,
        action: 'COURIER_CREDENTIALS_TEST_FAILED',
        entity: 'DeliveryProvider',
        entityId: provider.id,
        // Their message, never ours to the screen — and never the password.
        newData: { courier: provider.name, reason: result.reason, courierSaid: raw.slice(0, 300) },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
