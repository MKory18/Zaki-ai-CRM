import type { AiProvider } from './ai-provider';

/**
 * CAN THE MODEL THE OWNER CHOSE READ A PICTURE?
 *
 * S3's addition says what happens when it cannot: «وإذا الموديل المختار ما
 * بيقرا صور → بيشتغل من المواصفات المكتوبة بس، وبيطلع سطر بيقول ليش».
 *
 * So this is not a capability table for its own sake — it exists so the
 * screen can say ONE TRUE SENTENCE instead of two wrong ones. Without it
 * the two failures are indistinguishable: a page built from the written
 * specs alone looks exactly like a page where the photograph was unreadable,
 * and the owner concludes the feature is broken rather than that his model
 * is a text model.
 *
 * ⚠️ UNKNOWN MEANS NO, AND THAT IS THE WHOLE DESIGN.
 *
 * Sending an image to a model that cannot read one is not free: some
 * vendors answer 400 and the owner sees «المزوّد ردّ بخطأ», and some
 * accept the request, ignore the image and hallucinate a box — which is
 * the worse of the two, because a hallucinated box text would pass the
 * «من العلبة» check in `landing-build.ts` and stamp provenance on an
 * invention. A conservative list refuses the picture and says why; an
 * optimistic one launders a guess into evidence.
 *
 * The lists are MODEL-NAME patterns rather than exact ids on purpose: a
 * vendor ships `gpt-4o-2024-11-20` and OpenRouter prefixes everything with
 * its publisher. An exact-id table would have to be edited the week any
 * vendor ships a point release, and until somebody did, every owner on the
 * new model would be told his model cannot see.
 */

/** Model-name fragments that read images, lower-cased. */
const VISION_PATTERNS = [
  // OpenAI and whatever serves it
  'gpt-4o',
  'gpt-4.1',
  'gpt-4-turbo',
  'gpt-4-vision',
  'gpt-5',
  'o3',
  'o4',
  'chatgpt-4o',
  // Anthropic — every Claude from 3 onwards reads images
  'claude-3',
  'claude-4',
  'claude-5',
  'claude-sonnet',
  'claude-opus',
  'claude-haiku',
  // Google
  'gemini',
  // the open-weight ones an owner actually runs at home
  'llava',
  'bakllava',
  'llama-3.2-vision',
  'llama3.2-vision',
  'minicpm-v',
  'moondream',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen-vl',
  'pixtral',
  'internvl',
  'molmo',
  'gemma3',
  'mistral-small-3',
  // and the honest catch-all a vendor puts in the name itself
  'vision',
  '-vl',
];

export function modelReadsImages(provider: AiProvider, model: string): boolean {
  const name = String(model ?? '').toLowerCase();
  if (!name) return false;
  /*
   * ANTHROPIC IS THE ONE PROVIDER WHOSE WHOLE CURRENT RANGE READS IMAGES,
   * so a model id this list has not met yet is believed there and nowhere
   * else. It is still a pattern check first: `claude-2` does not.
   */
  if (provider === 'ANTHROPIC' && /^claude-(?:3|4|5|sonnet|opus|haiku)/.test(name)) return true;
  return VISION_PATTERNS.some((p) => name.includes(p));
}

/**
 * WHY THE PHOTOGRAPH IS NOT IN THIS CALL — in the owner's words, or null.
 *
 * Null when the picture IS going: a line explaining that nothing is wrong
 * is a line that teaches the owner to stop reading these lines.
 */
export function visionReasonAr(
  route: { provider: AiProvider; model: string },
  has: { image: boolean }
): string | null {
  if (!has.image) {
    return 'ما في صورة رئيسيّة لهذا المنتج — انبنى من المواصفات المكتوبة وحدها.';
  }
  if (!modelReadsImages(route.provider, route.model)) {
    return `النموذج المختار (${route.provider} · ${route.model}) ما بيقرا صور — انبنى من المواصفات المكتوبة وحدها. غيّره من إعدادات الذكاء إذا بدّك يقرا العلبة.`;
  }
  return null;
}
