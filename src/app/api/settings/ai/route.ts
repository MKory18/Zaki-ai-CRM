import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { AI_PROVIDERS, aiSettings, saveAiSettings } from '@/lib/ai-provider';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * GET/PUT /api/settings/ai — which AI, which model, whose key.
 *
 * The key is WRITE-ONLY. It is encrypted before storage, this endpoint
 * never returns it, and the audit entry records that it changed without
 * recording what it changed to. Only a hint — the last four characters —
 * comes back, so somebody can tell which key is in there.
 */

const schema = z.object({
  provider: z.enum(['OPENROUTER', 'OPENAI', 'ANTHROPIC']),
  model: z.string().trim().max(120),
  /** The house prompt prepended to every request. */
  prompt: z.string().trim().max(4000).optional(),
  /** A new key, or null to clear it. Omitted leaves the stored one alone. */
  apiKey: z.string().trim().min(8).max(400).nullable().optional(),
});

export async function GET() {
  try {
    const { companyId } = await requireContext();
    await requirePermission('settings.view');
    return NextResponse.json({
      settings: await aiSettings(companyId),
      providers: AI_PROVIDERS,
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
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }

    const before = await aiSettings(companyId);
    let saved;
    try {
      saved = await saveAiSettings(companyId, parsed.data);
    } catch (e) {
      if (e instanceof Error && e.message === 'ENCRYPTION_KEY_MISSING') {
        // Refusing is the safe failure: a key stored in the clear is worse
        // than no AI at all.
        return NextResponse.json(
          {
            error: 'مفتاح التشفير غير مُهيّأ على الخادم (APP_ENCRYPTION_KEY) — لن يُحفظ مفتاح الذكاء بلا تشفير.',
            code: 'ENCRYPTION_UNAVAILABLE',
          },
          { status: 503 }
        );
      }
      throw e;
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'AI_SETTINGS_UPDATED',
      entity: 'Company',
      entityId: companyId,
      previousData: { provider: before.provider, model: before.model, hasKey: before.hasKey },
      // The key itself is never written to the log — only that it moved.
      newData: {
        provider: saved.provider,
        model: saved.model,
        hasKey: saved.hasKey,
        keyChanged: parsed.data.apiKey !== undefined,
      },
    });

    return NextResponse.json({ settings: saved });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
