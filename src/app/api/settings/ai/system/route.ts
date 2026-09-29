import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { AI_PROVIDERS, saveSystemAi, systemAi } from '@/lib/ai-provider';
import { allowedHosts, parseLocalEndpoint } from '@/lib/ai-endpoint';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * GET/PUT /api/settings/ai/system — the INSTALLATION's vendor accounts.
 *
 * «المزوّد والمفتاح ... واحفظو للـ System». A company's AI settings are its
 * own voice — its prompts, what its assistant may read — and stay on
 * /api/settings/ai. What lives here is infrastructure: who pays the vendor,
 * which models exist, and where the owner's own model server is.
 *
 * THE KEY IS WRITE-ONLY, and more strictly than before. It is encrypted
 * before storage, this endpoint never returns it, and it never returns a
 * fragment of it either — no mask, no last-four. The courier-credentials
 * route is the pattern: it hints the LOGIN and never the PASSWORD, and an
 * AI key has no login beside it to hint instead. What comes back is which
 * vendor holds a key, when it was put there and who put it there.
 *
 * The audit records THAT a key moved, never what it moved to. An audit log
 * holding secrets is a second place to steal them from.
 */

const schema = z.object({
  provider: z.enum(['OPENROUTER', 'OPENAI', 'ANTHROPIC', 'LOCAL']),
  model: z.string().trim().max(120),
  /** A key per vendor: a value sets it, null clears it, absent leaves it. */
  providerKeys: z.record(z.string(), z.string().trim().min(8).max(400).nullable()).optional(),
  /**
   * The address of a model the owner runs. Validated by `parseLocalEndpoint`
   * rather than by zod: what makes an address acceptable here is which
   * NETWORK it is on, which is a rule with reasons, not a pattern.
   */
  localBaseUrl: z.string().trim().max(300).nullable().optional(),
});

/**
 * INSTALLATION SETTINGS NEED AN INSTALLATION-LEVEL ROLE.
 *
 * This is a RESTRICTION, not one of the `role === 'SUPER_ADMIN'` bypasses
 * `authorization.ts` forbids: `requirePermission` has already run and
 * already decided the caller may manage settings. This narrows that further,
 * because the row being written is shared by every company on the box — a
 * company admin changing their own prompts must not be able to change the
 * key every other company's assistant runs on.
 */
function refuseUnlessInstallationAdmin(role: string) {
  if (role === 'SUPER_ADMIN') return null;
  return NextResponse.json(
    {
      error: 'إعدادات الذكاء على مستوى النظام يضبطها مدير النظام فقط.',
      code: 'SUPER_ADMIN_ONLY',
    },
    { status: 403 }
  );
}

export async function GET() {
  try {
    const { user } = await requireContext();
    await requirePermission('settings.view');
    const denied = refuseUnlessInstallationAdmin(user.role);
    if (denied) return denied;

    return NextResponse.json({
      system: await systemAi(),
      providers: AI_PROVIDERS,
      // Whether an operator has allowed any host by hand, not WHICH — the
      // browser has no use for the list and it describes the network.
      hasHostAllowlist: allowedHosts().length > 0,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('settings.manage');
    const denied = refuseUnlessInstallationAdmin(user.role);
    if (denied) return denied;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    /**
     * WHERE THE SERVER MAY BE POINTED.
     *
     * Checked before anything is written, and the refusal is the rule's own
     * sentence — `ai-endpoint.ts` explains at length what a free-text base
     * URL can be abused for: exfiltrating every prompt to a host somebody
     * chose, reading the cloud metadata service, or reaching into the
     * private network from inside it.
     */
    let localBaseUrl: string | null | undefined;
    if (parsed.data.localBaseUrl !== undefined) {
      if (parsed.data.localBaseUrl === null || parsed.data.localBaseUrl === '') {
        localBaseUrl = null;
      } else {
        const checked = parseLocalEndpoint(parsed.data.localBaseUrl, allowedHosts());
        if (!checked.ok) {
          return NextResponse.json({ error: checked.message, code: checked.code }, { status: 400 });
        }
        localBaseUrl = checked.url;
      }
    }

    // A local model with nowhere to send the request saves cleanly and then
    // fails at the moment somebody asks a question. Said now instead.
    const before = await systemAi();
    if (parsed.data.provider === 'LOCAL' && !(localBaseUrl ?? before.localBaseUrl)) {
      return NextResponse.json(
        { error: 'اكتب عنوان الخادم الذي يشغّل النموذج قبل اختياره مزوّداً.', code: 'ENDPOINT_REQUIRED' },
        { status: 400 }
      );
    }

    let saved;
    try {
      saved = await saveSystemAi({ ...parsed.data, localBaseUrl }, user.id);
    } catch (e) {
      if (e instanceof Error && e.message === 'ENCRYPTION_KEY_MISSING') {
        // Refusing is the safe failure: a key stored in the clear is worse
        // than no AI at all.
        return NextResponse.json(
          {
            error:
              'مفتاح التشفير غير مُهيّأ على الخادم (APP_ENCRYPTION_KEY) — لن يُحفظ مفتاح الذكاء بلا تشفير.',
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
      action: 'AI_SYSTEM_SETTINGS_UPDATED',
      entity: 'SystemSetting',
      entityId: 'ai',
      previousData: {
        provider: before.provider,
        model: before.model,
        localBaseUrl: before.localBaseUrl,
        // WHICH vendors held a key, never any part of one.
        configured: Object.entries(before.providerKeys).filter(([, v]) => v.configured).map(([k]) => k),
      },
      newData: {
        provider: saved.provider,
        model: saved.model,
        localBaseUrl: saved.localBaseUrl,
        configured: Object.entries(saved.providerKeys).filter(([, v]) => v.configured).map(([k]) => k),
        // That keys moved, and for which vendors. Never their values.
        keysTouched: Object.keys(parsed.data.providerKeys ?? {}),
      },
    });

    return NextResponse.json({ system: saved });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
