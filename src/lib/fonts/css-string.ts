/**
 * A string safe to put inside a CSS rule that lives inside a <style> tag.
 *
 * JSON.stringify quotes and escapes for CSS correctly — a `"` becomes `\"`,
 * which CSS reads as an escaped quote, so the string cannot be closed early.
 *
 * What it does NOT handle is the tag around the stylesheet. A family called
 * `</style><img onerror=...>` is still a valid CSS string, and still ends
 * the style element the moment the browser's HTML parser sees it — the CSS
 * was never the way out, the markup was. So `<` and `>` become CSS hex
 * escapes, which render identically and cannot close a tag.
 *
 * This matters because the value came from the `name` table of a file a
 * seller uploaded, which is to say from anywhere at all.
 */
export function cssString(value: string): string {
  return JSON.stringify(String(value))
    .replace(/</g, '\\3c ')
    .replace(/>/g, '\\3e ');
}
