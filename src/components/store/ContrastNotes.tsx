'use client';

import { RiErrorWarningLine } from '@remixicon/react';
import { contrastRatio, nearestPassing } from '@/lib/landing-theme';
import { CONTRAST_PAIRS, ROLE_THEME_FIELD } from '@/lib/store-skin';
import { themeRoleColors, type StoreTheme } from '@/lib/store-theme';

/**
 * A REFUSAL THAT CARRIES A KEY.
 *
 * «الألوان حسب الدور؛ اللون الساقط بالتباين بينرفض مع أقرب لون ناجح».
 *
 * The refusal already existed in `storeSkinSchema` — seven pairs at 4.5:1,
 * checked when a template is validated. What a seller got from the colour
 * pickers was nothing at all: they could set a grey on a grey, save it,
 * and find out from a customer. And a refusal on its own is only half an
 * answer; a seller told «مرفوض» tries a slightly different colour, is
 * refused again, and decides the picker is broken.
 *
 * So this says WHICH pair fails, by the name of the thing a shopper reads
 * («السعر على البطاقة», not `price/surface1`), and offers the nearest
 * colour that works — the seller's own hue, moved only in lightness, in
 * one press.
 *
 * IT CHECKS WHAT THE SHOP WILL PAINT, NOT WHAT THE SELLER TYPED. Most
 * colour fields are empty most of the time because the palette derives
 * them from the accent, so `themeRoleColors` resolves them through the
 * same function the page is painted by. A checker reading the theme's own
 * `colors` would pass a palette that fails on screen.
 */

export function ContrastNotes({
  theme,
  onFix,
}: {
  theme: StoreTheme;
  /** Writes one colour field. The accent has its own control. */
  onFix: (field: string, hex: string) => void;
}) {
  const colors = themeRoleColors(theme);

  const failing = CONTRAST_PAIRS.flatMap((pair) => {
    const fg = colors[pair.fg];
    const bg = colors[pair.bg];
    if (!fg || !bg) return [];
    const ratio = contrastRatio(fg, bg);
    if (ratio >= pair.min) return [];
    return [{ pair, fg, bg, ratio, nearest: nearestPassing(fg, bg, pair.min) }];
  });

  if (failing.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] p-3"
    >
      <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--sys-destructive)]">
        <RiErrorWarningLine className="h-4 w-4" />
        {failing.length === 1 ? 'لونٌ لا يُقرأ' : `${failing.length} ألوان لا تُقرأ`}
      </p>
      <p className="mb-2 mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
        النصّ على خلفيته يحتاج تبايناً ٤٫٥ على الأقل، وإلا صار غير مقروء على شاشة في الشمس أو لعينٍ
        ضعيفة.
      </p>
      <ul className="space-y-1.5">
        {failing.map(({ pair, fg, bg, ratio, nearest }) => {
          // The accent is set by its own picker above this grid, not by a
          // field in it — so a one-press fix would have nowhere to write.
          const field = ROLE_THEME_FIELD[pair.fg];
          return (
            <li key={`${pair.fg}-${pair.bg}`} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 rounded border border-[var(--sys-border)]"
                  style={{ background: bg, color: fg }}
                />
                <span className="font-semibold text-[var(--sys-foreground)]">{pair.what}</span>
              </span>
              <span className="text-[var(--sys-muted)]" dir="ltr">
                {ratio.toFixed(1)}:1 &lt; {pair.min}:1
              </span>
              {nearest && field ? (
                <button
                  type="button"
                  onClick={() => onFix(field, nearest)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--sys-border)] px-2 py-0.5 font-bold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
                >
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4 rounded-full border border-[var(--sys-border)]"
                    style={{ background: nearest }}
                  />
                  استعمل أقرب لون ناجح
                </button>
              ) : (
                <span className="text-[var(--sys-muted)]">
                  {nearest
                    ? 'غيّره من الضابط الخاص به فوق'
                    : 'لا درجة من هذا اللون تنجح على هذه الخلفية — غيّر الخلفية أو اللون'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
