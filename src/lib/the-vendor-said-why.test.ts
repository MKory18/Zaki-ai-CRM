import { describe, expect, it } from 'vitest';
import { explainAiError } from '@/lib/ai-error-message';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «المزوّد ردّ بخطأ 400» IS NOT AN ANSWER.
 *
 * Anthropic returns 400 for a malformed request AND for «your credit
 * balance is too low to access the Anthropic API». The second is not a
 * programming error at all — it has a four-word answer the owner can act
 * on — and it arrived looking exactly like the first.
 *
 * And the usual cause is not an empty wallet: it is a key issued by one
 * organisation while the credit sits in another. Which is why the
 * sentence says that, rather than «اشحن رصيدك».
 *
 * The thrown error now carries `AI_HTTP_<status>|<model>|<what the vendor
 * said>`, so these read the sentence a person would be shown.
 * ═══════════════════════════════════════════════════════════════════════
 */

const vendorSaid = (status: number, model: string, said: string) =>
  new Error(`AI_HTTP_${status}|${model}|${said}`);

describe('when the vendor refuses', () => {
  it('an empty Anthropic balance is named, and so is its usual cause', () => {
    const out = explainAiError(
      vendorSaid(400, 'claude-sonnet-5-5', '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')
    );

    expect(out.ok).toBe(false);
    expect(out.error).toContain('رصيدك عند Anthropic صفر');
    expect(out.error, 'ما قال السبب الأشيع').toContain('نفس المنظمة');
  });

  it('and an ordinary 400 is not mistaken for it', () => {
    const out = explainAiError(vendorSaid(400, 'claude-sonnet-5-5', '{"error":{"message":"max_tokens is required"}}'));
    expect(out.error).toContain('400');
    expect(out.error).not.toContain('رصيدك');
  });

  it('and a 404 names the model it tried', () => {
    // «اختر نموذجاً من القائمة» on its own leaves the owner guessing which
    // of the names in front of him was the one refused.
    const out = explainAiError(vendorSaid(404, 'claude-sonnet-4-5', '{"error":"model not found"}'));
    expect(out.error).toContain('claude-sonnet-4-5');
    expect(out.error).toContain('اختر نموذجاً');
  });

  it('and a refused key still reads as a refused key', () => {
    const out = explainAiError(vendorSaid(401, 'gpt-4o-mini', 'invalid api key'));
    expect(out.error).toContain('رفض المفتاح');
  });

  it('and a thrower that only knows the status still gets its own sentence', () => {
    // Not every throw site has the response in hand. A mapper that
    // understood only the new shape answered «تعذّر الوصول» to a refused
    // key — the generic sentence, for the one case it had a precise one for.
    expect(explainAiError(new Error('AI_HTTP_401')).error).toContain('رفض المفتاح');
    expect(explainAiError(new Error('AI_HTTP_404')).error).toContain('النموذج غير موجود');
    expect(explainAiError(new Error('AI_HTTP_429')).error).toContain('التمهّل');
  });

  it('and nothing the vendor wrote is pasted into the sentence', () => {
    /*
     * The body is the vendor's words about OUR request, and it can be a
     * JSON blob or an HTML error page. Showing it to the owner would be a
     * worse message than the status code was.
     */
    const out = explainAiError(vendorSaid(500, 'm', '<html><head><title>502 Bad Gateway</title>'));
    expect(out.error).not.toContain('<html>');
    expect(out.error).not.toContain('Bad Gateway');
    expect(out.error).toContain('500');
  });
});
