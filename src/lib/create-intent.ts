/**
 * «+ أنشئ» — THE WORD A FORM IS ASKED FOR BY.
 *
 * The box (Ctrl+K) cannot open another screen's form: a form is a piece of state inside a screen, and the screen is not mounted yet
 * when the box closes. So it does what every link in this product does — it goes to the screen and says what it wants in the
 * address: `/products?new=product`. The screen reads that one word (`useCreateIntent`), opens the form it ALREADY has, and takes the
 * word out of the address again, so a refresh or a copied link does not open it a second time.
 *
 * THIS FILE IS THE CLIENT'S HALF, and it is words only — no labels, no permissions. What is OFFERED, and under which names, is decided
 * on the server (`palette-create.ts`, sent by `GET /api/palette`), for the same reason the palette is built the way it is: a list of
 * everything with the forbidden rows hidden is a list every account downloads. The screens need only the closed set of words, to
 * refuse a value somebody typed into the address bar.
 */

/** The query parameter. One name, so the palette that writes it and the screens that read it cannot drift apart. */
export const CREATE_PARAM = 'new';

/**
 * Every form the box can open. Adding a word here without a screen that answers it is a row in the palette that does nothing — the
 * test beside `palette-create.ts` reads each host screen and refuses that.
 */
export const CREATE_KEYS = [
  'order',
  'ai-order',
  'import-orders',
  'product',
  'customer',
  'user',
  'campaign',
] as const;

export type CreateKey = (typeof CREATE_KEYS)[number];

/** An address is typed by anyone; only the closed set above is ever acted on. */
export function isCreateKey(value: unknown): value is CreateKey {
  return typeof value === 'string' && (CREATE_KEYS as readonly string[]).includes(value);
}

/** One row of «+ أنشئ», exactly as the server drew it. The palette adds nothing and decides nothing. */
export interface CreateRow {
  key: CreateKey;
  /** The name the screen's own button already has — one name for one thing. */
  label: string;
  /** The screen it opens on. */
  hint: string;
  icon: string;
  /** Other words that find it when somebody types them. */
  words: string[];
  /** `/products?new=product`. */
  href: string;
}
