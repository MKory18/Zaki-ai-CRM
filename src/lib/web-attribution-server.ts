import { encryptSecret, encryptionAvailable } from './secrets';
import { isEmptyAttribution, type WebAttribution } from './web-attribution';

/**
 * THE COLUMNS A WEB ORDER WRITES FOR ITS ATTRIBUTION — sealed where it must be.
 *
 * `_fbc` carries the click id and `_fbp` the browser id: each identifies one
 * person's browser to Meta, so each is ENCRYPTED at rest exactly as an ad
 * click id is on an order from the replies system (`order-intake.ts`,
 * `sealed`) and never returned by any screen — only
 * `POST /api/v1/capi/identifiers` opens them. The ad id, ad set id and the
 * utm labels are not personal and are kept plain.
 *
 * Without an encryption key the two cookies are DROPPED, never written in the
 * clear: a column named `…Enc` holding plaintext is worse than an empty one,
 * because every reader afterwards believes it is sealed. The order is still
 * created.
 *
 * Returns `{}` when there is nothing to keep, so spreading it into the
 * order's `data` changes nothing about an order that carried no attribution.
 */
export function attributionColumns(a: WebAttribution): Record<string, string> {
  if (isEmptyAttribution(a)) return {};
  const out: Record<string, string> = {};
  if (a.adId) out.adId = a.adId;
  if (a.adsetId) out.adsetId = a.adsetId;
  // Marks how the ad was identified: the link's own parameter. The replies
  // system's orders say CODE / CTWA / REF.
  if (a.adId || a.adsetId) out.adSourceType = 'URL';
  if (a.utmSource) out.utmSource = a.utmSource;
  if (a.utmMedium) out.utmMedium = a.utmMedium;
  if (a.utmCampaign) out.utmCampaign = a.utmCampaign;
  if (a.utmContent) out.utmContent = a.utmContent;
  if (a.utmTerm) out.utmTerm = a.utmTerm;

  if ((a.fbc || a.fbp) && !encryptionAvailable()) {
    console.error('the order door: APP_ENCRYPTION_KEY is not set — the Meta cookies were dropped, not stored');
    return out;
  }
  try {
    if (a.fbc) out.fbcEnc = encryptSecret(a.fbc);
    if (a.fbp) out.fbpEnc = encryptSecret(a.fbp);
  } catch {
    delete out.fbcEnc;
    delete out.fbpEnc;
  }
  return out;
}
