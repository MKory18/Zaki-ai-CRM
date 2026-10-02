import Link from 'next/link';
import { RiApps2Line } from './icons';
import type { CategoryNavVariant } from '@/lib/store-theme';

/**
 * WHAT KINDS OF THING THIS SHOP SELLS — the way in.
 *
 * Four arrangements of one list, and the list is always the categories
 * THIS shop's products actually carry (derived, never stored — see the
 * note in `storefrontCatalog`). A chip for a category with nothing in it
 * is a dead end a shopper walks into once.
 *
 * IT IS LINKS, NOT A CONTROL. The shelf renders on the server, so
 * choosing a category is a page: bookmarkable, sendable, and behind the
 * back button. Even the «dropdown» arrangement is a list styled to look
 * like one — a real `<select>` would need a script to navigate, and on a
 * mid-range Android that is a menu that does nothing for a second and a
 * half.
 *
 * AND IT DRAWS NOTHING FOR ONE CATEGORY. A shop whose products are all
 * of a kind has nothing to narrow, and a row with «الكل» and one chip
 * beside it is a control that cannot change anything.
 */
export function CategoryNav({
  categories,
  activeId,
  hrefFor,
  variant,
}: {
  categories: { id: string; name: string; image?: string | null }[];
  activeId: string | null;
  hrefFor: (id: string) => string;
  variant: CategoryNavVariant;
}) {
  if (categories.length < 2) return null;

  return (
    <nav className="sf-cats" data-nav={variant} aria-label="الفئات">
      <Link href={hrefFor('')} className="sf-cat" aria-current={!activeId || undefined}>
        {/* «الكل» has no picture and no initial that means anything, so
            it gets the icon set's own mark — never a typed symbol, which
            renders as whatever font the phone happens to have. */}
        <span className="sf-cat-mark" aria-hidden>
          <RiApps2Line size={24} />
        </span>
        <span className="sf-cat-name">الكل</span>
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={hrefFor(c.id)}
          className="sf-cat"
          aria-current={activeId === c.id || undefined}
        >
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image} alt="" className="sf-cat-img" loading="lazy" />
          ) : (
            <span className="sf-cat-mark" data-letter={(c.name ?? '').trim().charAt(0) || '—'} aria-hidden />
          )}
          <span className="sf-cat-name">{c.name}</span>
        </Link>
      ))}
    </nav>
  );
}
