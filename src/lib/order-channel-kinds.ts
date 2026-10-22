/**
 * THE KINDS OF ORDER CHANNEL, AND WHAT EACH IS CALLED — ONCE.
 *
 * The door (`/api/settings/channels` and its `/[id]`) validated against a list of its own, the screen kept a copy of the labels, and
 * the door kept a THIRD copy of the labels, exported and read by nobody. A route file is not where a constant that two doors and a
 * screen all need should live: Next reads what a route exports as its handlers, so a name exported from one looks like part of the API.
 *
 * One list and one set of labels, here. The screen's COLOUR for each kind (`KIND_TONE`) stays on the screen — a colour is a look, not
 * a name. And the attribution table's own labels for the same kinds (`AttributionTable.tsx`) are deliberately not folded in: four of
 * its ten spellings differ («تيك توك» for «تيكتوك», «تيليغرام» for «تلجرام», «ملف» for «شيت», «موقع» for «الموقع»), and which spelling a
 * person reads is the owner's to choose, not a refactor's.
 */

export const CHANNEL_KINDS = [
  'LANDING_PAGE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'WHATSAPP',
  'TELEGRAM', 'PHONE', 'SHEET', 'WEBSITE', 'OTHER',
] as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const CHANNEL_KIND_AR: Record<string, string> = {
  LANDING_PAGE: 'صفحة هبوط',
  FACEBOOK: 'فيسبوك',
  INSTAGRAM: 'إنستغرام',
  TIKTOK: 'تيكتوك',
  WHATSAPP: 'واتساب',
  TELEGRAM: 'تلجرام',
  PHONE: 'هاتف',
  SHEET: 'شيت',
  WEBSITE: 'الموقع',
  OTHER: 'أخرى',
};
