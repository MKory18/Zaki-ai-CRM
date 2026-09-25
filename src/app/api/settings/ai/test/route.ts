import { NextResponse } from 'next/server';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { AiNotConfigured, aiChat, aiSettings } from '@/lib/ai-provider';

/**
 * POST /api/settings/ai/test — does the key actually work?
 *
 * A key is pasted in and saved, and nothing happens until somebody asks a
 * real question days later and gets a silent fallback answer. The provider
 * never says "your key is wrong" anywhere a seller looks — the assistant
 * simply stops being an assistant.
 *
 * So the settings screen asks the provider one cheap question and reports
 * exactly what came back. The key is never returned, never logged, and
 * never echoed in the answer: the reply says whether it worked, not what
 * it was.
 */

/** What went wrong, in words a seller can act on. */
function diagnose(error: unknown): { ok: false; error: string } {
  if (error instanceof AiNotConfigured) {
    return { ok: false, error: 'لم يُحفظ مفتاح بعد — الصق المفتاح واحفظ، ثم جرّب الاتصال.' };
  }
  const message = error instanceof Error ? error.message : '';
  const status = message.match(/^AI_HTTP_(\d+)$/)?.[1];

  if (status === '401' || status === '403') {
    return { ok: false, error: 'المزوّد رفض المفتاح — تأكد أنه مفتاح هذا المزوّد وأنه ما زال صالحاً.' };
  }
  if (status === '404') {
    return { ok: false, error: 'النموذج غير موجود عند هذا المزوّد — اختر نموذجاً من القائمة.' };
  }
  if (status === '429') {
    return { ok: false, error: 'المزوّد يطلب التمهّل — الحساب تجاوز حدّه أو رصيده انتهى.' };
  }
  if (status) return { ok: false, error: `المزوّد ردّ بخطأ ${status}.` };
  if (message.includes('abort')) {
    return { ok: false, error: 'انتهت المهلة بلا رد — تحقق من الاتصال بالإنترنت من الخادم.' };
  }
  return { ok: false, error: 'تعذّر الوصول إلى المزوّد.' };
}

export async function POST() {
  try {
    const { companyId } = await requireCompanyTenant();
    // Testing spends the company's own credit with their provider.
    await requirePermission('settings.edit');

    const settings = await aiSettings(companyId);

    try {
      const reply = await aiChat({
        companyId,
        // No house prompt and no job wording: this asks whether the key and
        // the model work, and a company prompt could make it fail for a
        // reason that has nothing to do with the connection.
        system: 'Reply with the single word: OK',
        user: 'ping',
        timeoutMs: 15_000,
      });

      return NextResponse.json({
        ok: true,
        provider: settings.provider,
        model: settings.model,
        // The first words back, so a seller sees a real reply rather than a
        // green tick they have to trust.
        reply: reply.trim().slice(0, 120),
      });
    } catch (error) {
      return NextResponse.json({ ...diagnose(error), provider: settings.provider, model: settings.model });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
