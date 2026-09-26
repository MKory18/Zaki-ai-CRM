import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, tierOf } from './ai-provider';
import { ASSISTANTS } from './ai-assistants';
import { repoFile, stripComments } from './guard-source';

/**
 * A VENDOR PER ASSISTANT, AND A KEY PER VENDOR.
 *
 * One model for the whole product could not express the decision that
 * actually matters here: the note classifier runs on every follow-up note,
 * thousands a day, and the business analysis runs when somebody asks.
 * Charging both to an opus-tier model is how an AI bill becomes a
 * surprise; charging both to the cheapest is how the analysis becomes
 * useless.
 *
 * Two things must hold for that to be safe, and neither is obvious from
 * reading the screen.
 */

describe('routing a call', () => {
  /**
   * THE KEY MUST BELONG TO THE VENDOR THAT WAS RESOLVED.
   *
   * Pointing an assistant at Anthropic while the only key in the box is
   * OpenAI's is a setting that SAVES CLEANLY and fails only when somebody
   * asks a question — far from the screen that caused it. The resolver
   * picks the key by the provider it resolved, and the environment key,
   * whose name says `OPENROUTER`, is offered to OpenRouter alone.
   */
  it('takes the key of the provider it resolved, never whichever is stored', () => {
    const src = stripComments(repoFile('src/lib/ai-provider.ts'));
    expect(src, 'لا موجِّه لكلّ مساعد').toContain('async function routeFor');
    // The per-vendor store is consulted by the resolved provider's id.
    expect(src).toMatch(/ai\.keys\?\.\[provider\]/);
    // The legacy single key is only offered to the provider it was entered
    // under — never handed to a vendor that did not issue it.
    expect(src).toMatch(/provider === fallback && ai\.apiKeyEncrypted/);
    // And the environment key is OpenRouter's, by its own name.
    expect(src).toMatch(/provider === 'OPENROUTER'\) key = process\.env\.OPENROUTER_API_KEY/);
  });

  /**
   * A MODEL BELONGS TO A VENDOR.
   *
   * When an assistant switches vendor and names no model, the company's
   * model is the WRONG default: `gpt-4o` is not a name Anthropic answers
   * to. The new vendor's own default is used instead.
   */
  it('does not carry a model across a vendor switch', () => {
    const src = stripComments(repoFile('src/lib/ai-provider.ts'));
    expect(src).toMatch(/chosen && chosen !== fallback/);
    const ui = stripComments(repoFile('src/components/screens/ai/AssistantsTable.tsx'));
    expect(ui, 'تبديل المزوّد يُبقي نموذج المزوّد القديم').toMatch(
      /patch\.provider !== undefined && patch\.provider !== mine\.provider\) delete merged\.model/
    );
  });

  it('and an unknown vendor is dropped rather than stored', () => {
    const src = stripComments(repoFile('src/lib/ai-provider.ts'));
    // A typo must not route an assistant at a vendor that does not exist:
    // the failure would surface as «الذكاء غير مضبوط» on a far screen.
    expect(src).toMatch(/AI_PROVIDERS\.find\(\(p\) => p\.id === v\.provider\)\?\.id/);
  });
});

describe('what the screen offers', () => {
  it('a routing control for every assistant that has one', () => {
    const ui = stripComments(repoFile('src/components/screens/ai/AssistantsTable.tsx'));
    expect(ui).toContain('routing[a.promptJob]');
    // «الافتراضي» is a real choice, and the common one.
    expect(ui).toContain('الافتراضي');
  });

  it('and every assistant has a job to be routed by', () => {
    for (const a of ASSISTANTS) {
      expect(a.promptJob, `${a.key}: بلا وظيفة يُوجَّه بها`).toBeTruthy();
    }
  });

  it('and the tier is named beside the model, so the cost is a decision', () => {
    // The whole point of per-assistant routing is choosing a tier; a model
    // box with no sense of what a name costs is the setting that produced
    // the surprise in the first place.
    expect(tierOf('claude-opus-5-5')?.tier).toBe('الأعلى');
    expect(tierOf('claude-haiku-4-5-20251001')?.tier).toBe('اقتصادي');
    expect(tierOf('claude-sonnet-5')?.tier).toBe('متوازن');
  });

  it('and every vendor suggests models that are its own', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.models.length, `${p.id}: بلا اقتراحات`).toBeGreaterThan(0);
      expect(p.models, `${p.id}: الافتراضي ليس من قائمته`).toContain(p.defaultModel);
    }
  });
});
