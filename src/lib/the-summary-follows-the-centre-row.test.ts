import { describe, expect, it, vi } from 'vitest';

/**
 * THE DAILY SUMMARY GOES WHERE THE OWNER ROUTED THE ANALYSIS.
 *
 * It is the same kind of reading as the intelligence centre, and the owner
 * routes that row in AI settings — to his own server, say, so that profit
 * figures do not leave the building. The summary went to the company
 * default whatever that row said. It now names the row (`job: 'advisor'`),
 * with its own wording unchanged.
 */

const { aiChat } = vi.hoisted(() => ({ aiChat: vi.fn() }));
vi.mock('@/lib/ai-provider', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-provider')>()),
  aiChat: (...a: unknown[]) => aiChat(...a),
  aiSettings: async () => ({ prompts: {} }),
}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { generateAiBusinessAnalysis } from './ai';

describe('the daily summary', () => {
  it('asks through the intelligence centre’s row, keeping its own words', async () => {
    aiChat.mockResolvedValue(JSON.stringify({ summary: 's', observations: [], risks: [], recommendations: [] }));
    await generateAiBusinessAnalysis({ total_orders: 1 } as never, 'c1');
    const req = aiChat.mock.calls[0][0] as { job?: string; system?: string };
    expect(req.job).toBe('advisor');
    expect(req.system).toBeTruthy();
  });
});
