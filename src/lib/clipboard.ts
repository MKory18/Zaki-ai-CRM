/**
 * COPYING, WHERE COPYING IS NOT ALLOWED.
 *
 * `navigator.clipboard` exists only in a secure context — HTTPS, or
 * localhost. Over plain HTTP, which is where this system will sit the day
 * it goes on an office server without a certificate, the property is simply
 * missing and every `await` on it throws.
 *
 * Six buttons in this app called it inside `catch {}`. On such a machine
 * they looked broken: press, nothing, no message, no clue. That is worse
 * than an error, because the person concludes the feature does not work and
 * stops using it.
 *
 * So: try the real API, fall back to the old selection trick, and if both
 * fail SAY SO. The caller is told whether the text reached the clipboard,
 * and can offer it for manual copying instead of pretending.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Blocked by permissions or an insecure context — try the old way.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but still focusable: `display:none` cannot be selected,
    // and a visible box would flash on every copy.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
