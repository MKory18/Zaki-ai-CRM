/**
 * THE PROSE IS FOR WHOEVER READS THE SOURCE, NOT FOR A PHONE ON 3G.
 *
 * The shop inlines its whole stylesheet into every page it serves, and
 * measured on the storefront that is 51.7 KB — of which 16.2 KB is comments
 * explaining to a developer why a rule is written the way it is. Those
 * sentences are worth keeping; they are worth keeping in the FILE. A
 * shopper on a mid-range Android pays for them on every page load, in the
 * render-blocking part of the document, and gets nothing.
 *
 * WHY NOT A REGEX. `/\/\*[\s\S]*?\*\//g` is the obvious answer and it is
 * wrong: a `/*` inside a string or a `url()` is content, not a comment, and
 * a stripper that cannot tell them apart deletes live CSS from the middle
 * of a rule and leaves a stylesheet that still parses. This is the same
 * reason `stripTemplates` in guard-source.ts is a character scanner — the
 * two problems are one problem.
 *
 * WHY NOT A MINIFIER. `lightningcss` and `esbuild` are both installed, and
 * both are somebody else's transitive dependency rather than this project's
 * — a build that reached for one would break the day Next stopped shipping
 * it. What is written here is the part that is safe without a parser:
 * comments go, runs of whitespace become one space, and NOTHING ELSE moves.
 * No selector is rewritten, no `;` before a `}` is dropped, no colour is
 * shortened. A rule that survives this is byte-for-byte the rule that was
 * written, minus the air.
 */

/**
 * The same stylesheet with its comments and its indentation removed.
 *
 * Whitespace is COLLAPSED, never deleted: ` > ` and `>` mean the same
 * thing, but `a b` and `ab` do not, and only a parser knows which one it is
 * looking at. One space is always safe.
 */
export function minifyCss(css: string): string {
  let out = '';
  let i = 0;
  const n = css.length;

  while (i < n) {
    const c = css[i];

    // A string. Everything to the closing quote is content — including a
    // `/*`, a `}`, and anything else that looks like syntax.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (css[j] === '\\') { j += 2; continue; }
        if (css[j] === quote) { j++; break; }
        j++;
      }
      out += css.slice(i, j);
      i = j;
      continue;
    }

    // `url(…)` without quotes: unquoted URL tokens may hold almost
    // anything up to the closing paren.
    if (c === 'u' && css.startsWith('url(', i)) {
      const close = css.indexOf(')', i);
      if (close !== -1) {
        out += css.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }

    // A comment. An unterminated one swallows the rest, which is what a
    // browser does with it too.
    if (c === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      // It leaves a space behind: `a/**/b` is two tokens, not one.
      if (out && !/\s$/.test(out)) out += ' ';
      continue;
    }

    // A run of whitespace becomes one space.
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
      let j = i;
      while (j < n && /[ \t\n\r\f]/.test(css[j])) j++;
      if (out && !/\s$/.test(out)) out += ' ';
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out.trim();
}
