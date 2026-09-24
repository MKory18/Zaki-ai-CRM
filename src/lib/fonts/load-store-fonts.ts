import { db } from '@/lib/db';
import { fontFaceCss } from './store-fonts';

/**
 * A store's uploaded faces, ready to put on a page.
 *
 * One function for the editor and the published page. They had better agree
 * about which faces exist and what their @font-face rules say — a preview
 * that draws a font the live page does not is worse than no preview.
 */

export interface StoreFontFamily {
  /** Slug used in the picker and in the URL. */
  key: string;
  /** The seller's name for it. */
  label: string;
  /** The family the browser matches on. */
  family: string;
  /** A CSS stack, so it drops straight into the same field as the built-ins. */
  stack: string;
  /** Which weights were actually uploaded — nothing else will render. */
  weights: number[];
  /** True when the designer's own words suggest serving it is not allowed. */
  restricted: boolean;
  /** Whether the seller stated they hold the right to serve it. */
  attested: boolean;
}

export function storeFontUrl(
  storeId: string,
  f: { key: string; weight: number; italic: boolean; format: string }
): string {
  return `/api/store-fonts/${storeId}/${f.key}-${f.weight}${f.italic ? 'i' : 'n'}.${f.format}`;
}

interface Row {
  key: string; label: string; family: string; weight: number;
  italic: boolean; format: string; restricted: boolean; attestedAt: Date | null;
}

/** Group the uploaded files into the families a seller actually picks from. */
export function groupFamilies(rows: Row[]): StoreFontFamily[] {
  const byKey = new Map<string, StoreFontFamily>();
  for (const r of rows) {
    let fam = byKey.get(r.key);
    if (!fam) {
      fam = {
        key: r.key,
        label: r.label,
        family: r.family,
        // A generic fallback, never another uploaded face: falling back to
        // one the seller also uploaded hides the fact that a weight failed.
        stack: `${JSON.stringify(r.family)}, system-ui, sans-serif`,
        weights: [],
        restricted: false,
        attested: true,
      };
      byKey.set(r.key, fam);
    }
    if (!fam.weights.includes(r.weight)) fam.weights.push(r.weight);
    // One restricted file makes the family restricted; one unattested file
    // makes the family unattested. The cautious reading of a mixed set.
    if (r.restricted) fam.restricted = true;
    if (!r.attestedAt) fam.attested = false;
  }
  for (const f of byKey.values()) f.weights.sort((a, b) => a - b);
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

/**
 * Everything a page needs about its store's fonts: the families for the
 * picker and the @font-face rules for the document.
 *
 * A page with no store, or a store with no uploads, gets empty strings and
 * an empty list — never a query that returns somebody else's fonts.
 */
export async function loadStoreFonts(storeId: string | null | undefined): Promise<{
  families: StoreFontFamily[];
  css: string;
}> {
  if (!storeId) return { families: [], css: '' };

  const rows = await db.storeFont.findMany({
    where: { storeId },
    orderBy: [{ label: 'asc' }, { weight: 'asc' }],
    select: {
      key: true, label: true, family: true, weight: true,
      italic: true, format: true, restricted: true, attestedAt: true,
    },
  });
  if (rows.length === 0) return { families: [], css: '' };

  const families = groupFamilies(rows);

  // The mapping from `u:<slug>` to a real family name lives in the
  // stylesheet, as a custom property per family. That keeps stackFor() a
  // pure function with no idea which store it is drawing — and a font the
  // seller deleted resolves to its fallback instead of to nothing.
  const vars = families
    .map((f) => `--lp-uf-${f.key}: ${f.stack};`)
    .join(' ');

  return {
    families,
    css: `${fontFaceCss(rows, (f) => storeFontUrl(storeId, f))}
.lp-root, .zaki-store { ${vars} }`,
  };
}
