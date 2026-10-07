import { db } from './db';

/**
 * THE CURRENCY SOMETHING IS SOLD IN: ITS STORE'S COUNTRY.
 *
 * There used to be a second answer — a currency on the company, edited on
 * the system settings screen — and the pages that read it priced a Syrian
 * store's offers in the company's dinars while the order from the same page
 * was booked in pounds. The country is the only source now.
 *
 * A page with no store (a row from before stores existed) takes the
 * company's first country: every company has one, and it is the country the
 * business was set up in — the same place the company currency was copied
 * from when countries were introduced.
 */
export async function sellingCurrency(
  store: { country: { currencyCode: string } } | null | undefined,
  companyId: string
): Promise<string> {
  if (store?.country.currencyCode) return store.country.currencyCode;
  const first = await db.country.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { currencyCode: true },
  });
  return first?.currencyCode || 'USD';
}

/**
 * What a landing page select needs to price itself.
 *
 * The minor unit joined it the day `OfferView.price` became the figure
 * the customer is CHARGED rather than the one before the bundle's own
 * discount: a charged figure is rounded, and rounding is the country's
 * business. A page that selects the code without it can print a currency
 * it cannot round in.
 */
export const SELLING_STORE_SELECT = {
  select: { country: { select: { currencyCode: true, minorUnit: true } } },
} as const;
