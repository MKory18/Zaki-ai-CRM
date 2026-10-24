/**
 * THE EIGHT CARDS BEHIND ONE MENU LINE.
 *
 * Twelve settings screens stood as twelve entries in the sidebar. They are
 * one line now (`NavGroup.hub: 'cards'`), and this is what that line opens:
 * eight cards, each saying in a sentence what it holds and linking to the
 * screens that belong to it. The sentences are the guide's own words, so the
 * door and the screen behind it cannot describe the same thing two ways.
 *
 * Nothing here decides who may open what. The page draws a link only for a
 * screen the person may open (the same `useMayOpen` the strip above every
 * screen asks), and a card left with no link is not drawn at all. The server
 * guards each screen on its own permission, exactly as before — this is a
 * list of doors, not a lock.
 *
 * Every path must be a settings screen in the registry, and every settings
 * screen must be on exactly one card: a screen left off this page is one
 * nobody can find, since the sidebar no longer lists it. `the-menu-is-one-
 * line-a-group.test.ts` holds both directions.
 */

export interface SettingsCard {
  key: string;
  title: string;
  /** One sentence: what is decided here. */
  why: string;
  /** Registry paths, in the order they read. */
  paths: readonly string[];
}

export const SETTINGS_CARDS: readonly SettingsCard[] = [
  {
    key: 'geo',
    title: 'البلدان والمتاجر',
    why: 'أين تبيع: العملة والدوام والمحافظات لكل بلد، والمتجر يرث منه.',
    paths: ['/settings/geo'],
  },
  {
    key: 'couriers',
    title: 'الشحن',
    why: 'من يشحن لك وكم يأخذ لكل محافظة، مع دخول كل شركة إلى نظامها.',
    paths: ['/settings/couriers'],
  },
  {
    key: 'commission',
    title: 'العمولات',
    why: 'قواعد العمولة بالشرائح، لكل دور أو لموظف بعينه.',
    paths: ['/settings/commission'],
  },
  {
    key: 'channels',
    title: 'القنوات والتتبّع',
    why: 'من أين تأتي الطلبات، وبكسل التتبّع والحملات، والحسابات الإعلانية.',
    paths: ['/settings/channels', '/settings/tracking'],
  },
  {
    key: 'chat',
    title: 'واتساب وتلجرام',
    why: 'حالة الربط وإعادة الاتصال. المحادثات نفسها في «المحادثات».',
    paths: ['/settings/links'],
  },
  {
    key: 'ai',
    title: 'الذكاء الاصطناعي',
    why: 'المزوّد والمفتاح، ونصوص كل مهمة، وقوالب رسائل الزبائن.',
    paths: ['/settings/ai'],
  },
  {
    key: 'apps',
    title: 'التطبيقات',
    why: 'ما يتكلّم معه النظام: تثبيته، وسجلّ ما أُرسل إليه.',
    paths: ['/apps/store', '/apps/installed'],
  },
  {
    key: 'system',
    title: 'النظام',
    why: 'اسم الشركة، والمهام التي يشغّل النظام بها نفسه.',
    paths: ['/settings/system', '/admin/jobs'],
  },
];
