import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «لخّصلي اليوم» — THE OWNER'S RULE ON A ROUTE THAT TALKS TO A MODEL.
 *
 * «ولا بيانات زبون لأي نموذج خارجي — الاسم والتلفون والعنوان ما بيوصلوا
 * إلا لنموذج شغّال على جهاز المالك.»
 *
 * This route's payload has no customer in it at all, by construction: it
 * can only stringify `PaletteFact`s, and a `PaletteFact` is a fixed Arabic
 * label and an integer. So the interesting question is not «did the name
 * get out» — there is no name to get out — but the two that are left:
 *
 *   1. DOES IT REFUSE A VENDOR ANYWAY? It must. The rule is about routes,
 *      not about the goodwill of today's payload, and the next person to
 *      add «وأكثر زبون يرجّع» to the prompt will add it to this route. If
 *      it can reach OpenRouter today it will carry a customer there
 *      tomorrow, and nothing will have changed in this file.
 *
 *   2. AND IS THE REFUSAL AN ANSWER OR AN APOLOGY? Refusing outright would
 *      leave the command dead for every company that has not stood up a
 *      local model — which is every company today. So the same five
 *      numbers come back as one fixed Arabic sentence, and the screen is
 *      told WHY it is the plain version.
 *
 * Asked on the PAYLOAD and on the REFUSAL PATH, driving the real route.
 * A test that checked `localOnly: true` was written in the source would
 * pass on a version that caught `AiNotLocal` and retried without it.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, requireContext, aiChat } = vi.hoisted(() => ({
  db: { order: { count: vi.fn() }, product: { findMany: vi.fn() } },
  requireContext: vi.fn(),
  aiChat: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: () => true,
  requirePermission: vi.fn(),
  getPermissionScope: (u: { __scope?: string }) => (u.__scope ? { scope: u.__scope } : null),
}));
vi.mock('@/lib/ai-provider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  aiChat: (...a: unknown[]) => aiChat(...a),
}));
vi.mock('@/lib/api-error', () => ({
  apiErrorResponse: (e: unknown) =>
    new Response(JSON.stringify({ error: `UNEXPECTED: ${(e as Error)?.message}` }), { status: 500 }),
}));

import { AiNotConfigured, AiNotLocal } from '@/lib/ai-provider';
import { POST } from './route';

const OWNER = {
  id: 'owner1',
  status: 'ACTIVE',
  role: 'COMPANY_ADMIN',
  companyId: 'c1',
  __scope: 'ALL_COMPANY',
};

const ask = () => POST();

/** Everything that went to the model, as one string. */
const sentToModel = () => JSON.stringify(aiChat.mock.calls[0]?.[0] ?? {});

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: OWNER, companyId: 'c1', storeId: 's1' });
  db.order.count.mockResolvedValue(6);
  db.product.findMany.mockResolvedValue([]);
  aiChat.mockResolvedValue('اليوم فيه ستّة طلبات جديدة، وستّة مؤجّلة.');
});

describe('what leaves for the model', () => {
  it('is the five counts and the five labels, and that is the whole payload', async () => {
    await ask();
    const sent = sentToModel();
    expect(aiChat, 'ما نُودي الموديل أصلاً').toHaveBeenCalledTimes(1);
    expect(sent).toContain('طلبات اليوم: 6');
    // Five lines, every one «label: integer» — see the prompt builder.
    const prompt = aiChat.mock.calls[0][0].user as string;
    expect(prompt.split('\n').length).toBe(5);
    for (const line of prompt.split('\n')) {
      expect(line, `سطرٌ ليس «تسمية: رقم»: ${line}`).toMatch(/^[^:]+: \d+$/);
    }
  });

  it('and carries no name, no phone, no address and no order number', async () => {
    await ask();
    const sent = sentToModel();
    expect(sent, 'رقمٌ طويلٌ في الحمولة — هاتفٌ على الأغلب').not.toMatch(/\d{7,}/);
    expect(sent, 'رقمُ طلبٍ في الحمولة').not.toMatch(/ORD-/i);
    expect(sent, 'هويّةُ السائل نفسها في الحمولة').not.toContain('owner1');
  });

  it('and the instructions tell it not to invent a number it was not given', async () => {
    await ask();
    const system = aiChat.mock.calls[0][0].system as string;
    expect(system).toContain('لا تُضف رقماً');
    expect(system).toContain('لا تذكر أسماء أشخاص');
  });

  it('and it says `localOnly` — on a payload that would have been safe anyway', async () => {
    // Belt and braces, and in that order: the guard is the thing that will
    // still be true after somebody widens the prompt.
    await ask();
    expect(aiChat.mock.calls[0][0].localOnly, 'النداء ما اشترط موديلاً محلّياً').toBe(true);
  });
});

describe('when the route is not the owner’s own machine', () => {
  beforeEach(() => {
    // `aiChat` throws this BEFORE the first byte leaves. The route must not
    // answer it by trying again without the condition.
    aiChat.mockRejectedValue(new AiNotLocal('OPENROUTER'));
  });

  it('it answers with the numbers themselves, and says why', async () => {
    const body = await (await ask()).json();
    expect(body.from).toBe('NUMBERS');
    expect(body.why).toBe('NOT_LOCAL');
    expect(body.text).toContain('6');
    expect(body.text, 'الجواب البديل اعتذارٌ لا تلخيص').not.toMatch(/تعذّر|تعذر/);
  });

  it('and names the vendor the route currently points at, so it can be changed', async () => {
    // «اذهب إلى إعدادات الذكاء» is only actionable if the screen can say
    // what to change it FROM.
    const body = await (await ask()).json();
    expect(body.provider).toBe('OPENROUTER');
  });

  it('and does not call a model a second time without the condition', async () => {
    await ask();
    expect(aiChat).toHaveBeenCalledTimes(1);
    expect(aiChat.mock.calls[0][0].localOnly).toBe(true);
  });
});

describe('when there is no model configured at all', () => {
  it('the same five numbers are still the answer', async () => {
    aiChat.mockRejectedValue(new AiNotConfigured());
    const body = await (await ask()).json();
    expect(body.from).toBe('NUMBERS');
    expect(body.why).toBe('NOT_CONFIGURED');
    expect(body.text).toContain('6');
  });

  it('and a local server that answers with nothing is not a paragraph', async () => {
    aiChat.mockResolvedValue('   ');
    const body = await (await ask()).json();
    expect(body.from).toBe('NUMBERS');
    expect(body.why).toBe('EMPTY_ANSWER');
  });
});

describe('it is a summary, not an action', () => {
  it('so it writes nothing — no cache row, no audit row', async () => {
    /*
     * «كلّ إجراء ذكاءٍ اصطناعيٍّ اقتراحٌ فقط». The daily-summary route
     * caches its answer and is allowlisted by name for it; this one does
     * not, because three sentences about counts that move every few
     * minutes are wrong by lunchtime. The mocked `db` carries no write
     * method at all, so a write here would throw rather than pass.
     */
    await ask();
    expect(Object.keys(db.order)).toEqual(['count']);
  });

  it('and an account that sees no orders is refused rather than summarised', async () => {
    requireContext.mockResolvedValue({
      user: { ...OWNER, __scope: undefined },
      companyId: 'c1',
      storeId: 's1',
    });
    const res = await ask();
    expect(res.status).toBe(403);
    expect(aiChat, 'نُودي الموديل لحسابٍ لا يرى طلباً').not.toHaveBeenCalled();
  });
});
