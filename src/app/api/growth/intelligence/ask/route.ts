import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { aiChat, AiNotConfigured, aiSettings, providerInfo } from '@/lib/ai-provider';
import { getCompanyAnalytics } from '@/lib/analytics';
import { teamPerformance } from '@/lib/team-performance';

/**
 * POST /api/growth/intelligence/ask — ask the AI about THIS company.
 *
 * The findings on the screen are rule-based and carry their evidence, which
 * is what makes them checkable. The AI does not replace them: it is handed
 * the same numbers and asked to read across them, and it is told — in the
 * strongest terms the prompt allows — never to invent a figure.
 *
 * That is why the context is assembled here and not chosen by the caller.
 * A question is free text; the data it may see is not.
 */

const schema = z.object({
  question: z.string().trim().min(3).max(2000),
  /** Which slices to hand it. Fewer means a cheaper, sharper answer. */
  sources: z.array(z.enum(['SALES', 'PRODUCTS', 'TEAM'])).min(1).max(3).optional(),
});

/** What the AI can be given, named so the screen can list it honestly. */
export const DATA_SOURCES = [
  { id: 'SALES', label: 'المبيعات والأرباح', detail: 'الإيراد والتكاليف والهوامش ونِسب التأكيد والتوصيل' },
  { id: 'PRODUCTS', label: 'المنتجات', detail: 'أداء كل منتج: طلبات، مؤكد، موصَّل، مرفوض، ربح' },
  { id: 'TEAM', label: 'أداء الفريق', detail: 'موظفو التأكيد: ما سحبوه وأكّدوه وأزمنتهم' },
] as const;

export async function GET() {
  try {
    const { companyId } = await requireContext();
    await requirePermission('ai.use');
    const settings = await aiSettings(companyId);
    return NextResponse.json({
      provider: providerInfo(settings.provider).label,
      model: settings.model,
      ready: settings.hasKey,
      housePrompt: settings.prompt,
      sources: DATA_SOURCES,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('ai.use');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'اكتب سؤالاً أولاً' }, { status: 400 });
    }
    const want = new Set(parsed.data.sources ?? ['SALES', 'PRODUCTS', 'TEAM']);

    const analytics = await getCompanyAnalytics({ companyId, storeId }, { period: '30d' });
    const context: Record<string, unknown> = { currency: country.currencyCode, window: 'آخر ٣٠ يوماً' };

    if (want.has('SALES')) context.sales = analytics.aiContext;
    if (want.has('PRODUCTS')) {
      // Trimmed: the whole table is mostly zeros and costs tokens to say so.
      context.products = (analytics.productStats ?? []).slice(0, 15);
    }
    if (want.has('TEAM')) {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 864e5);
      const team = await teamPerformance({
        companyId,
        storeId,
        calendar: {
          workHoursStart: country.workHoursStart,
          workHoursEnd: country.workHoursEnd,
          weekendDays: country.weekendDays,
          timezone: country.timezone,
        },
        start,
        end,
      });
      context.team = team.employees;
    }

    const system = [
      'أنت محلل أعمال للتجارة الإلكترونية بالدفع عند الاستلام.',
      'أجب بالعربية، بإيجاز، وبما يمكن تنفيذه.',
      'قاعدة قاطعة: لا تخترع أي رقم. استعمل الأرقام المعطاة حرفياً، وإن لم تكن البيانات كافية قل ذلك صراحةً.',
      'ميّز دائماً بين الطلب (طلبات) والربح الحقيقي (إيراد الموصَّل ناقص التكاليف).',
    ].join('\n');

    const answer = await aiChat({
      companyId,
      system,
      user: `البيانات:\n${JSON.stringify(context, null, 2)}\n\nالسؤال: ${parsed.data.question}`,
    });

    const settings = await aiSettings(companyId);
    return NextResponse.json({
      answer,
      model: settings.model,
      provider: providerInfo(settings.provider).label,
      sources: [...want],
    });
  } catch (error) {
    if (error instanceof AiNotConfigured) {
      return NextResponse.json(
        {
          error: 'لم يُضبط الذكاء الاصطناعي بعد — اختر المزوّد وأدخل المفتاح من إعدادات الذكاء الاصطناعي.',
          code: 'AI_NOT_CONFIGURED',
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message.startsWith('AI_HTTP_')) {
      return NextResponse.json(
        {
          error: `رفض المزوّد الطلب (${error.message.replace('AI_HTTP_', '')}) — تحقّق من المفتاح واسم النموذج.`,
          code: error.message,
        },
        { status: 502 }
      );
    }
    return apiErrorResponse(error);
  }
}
