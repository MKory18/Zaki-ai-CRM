/**
 * THREE LOOKS FOR THE SYSTEM — AND ONE MEANING FOR EVERY COLOUR.
 *
 * BLACK AND SKY, QUIETLY.
 *
 * One accent and no other hue: the greys are actually grey — no blue cast,
 * no warm cast, nothing competing — and the single colour in the system is
 * a calm sky blue that means "this is the action". A palette with two
 * personalities makes people hunt for the button; a palette with one makes
 * the button the only coloured thing on the page, which is the whole job.
 *
 * Quiet is a measurement, not a mood. The accent sits around 195° at a
 * lightness deep enough to carry white text, rather than the bright cyan
 * that reads as "sky" on a swatch and as a headache on a screen somebody
 * stares at for nine hours.
 *
 * The rule that makes a theme switch safe rather than merely pretty: the
 * SEMANTIC colours keep their meaning in all three. Amber is always "needs
 * attention", red is always "late, or money lost", green is always
 * "collected", and the accent is always "this is the action". Only the
 * SURFACES move — page, card, border, text.
 *
 * That is not decoration. People here work at speed and read colour before
 * they read words; a theme that made red mean something else in the dark
 * palette would make somebody miss a late shipment at four in the afternoon
 * because they switched theme at lunch.
 *
 * Each semantic colour is therefore tuned per theme for CONTRAST — a red
 * that is legible on a dark surface is not the same red that is legible on
 * a white one — and never re-assigned. Same meaning, readable everywhere.
 *
 * The store's own look is a separate family entirely (`--lp-*`, see
 * landing-theme.ts). Nothing here may reach a shop, and nothing there may
 * reach the dashboard; `theme-isolation.test.ts` enforces it.
 */

export interface SystemTheme {
  key: string;
  ar: string;
  /** What it is for, in a sentence, on the picker. */
  note: string;
  dark: boolean;
  vars: Record<string, string>;
}

/**
 * The names every screen uses. Listed once so a new theme cannot forget one
 * — a missing variable is a component that falls back to nothing and
 * renders invisible text.
 */
export const SYS_VARS = [
  'background',
  'card',
  'surface',
  'surface-strong',
  'heading',
  'foreground',
  'muted-foreground',
  'muted',
  'border',
  'border-strong',
  'primary',
  'primary-foreground',
  'primary-soft',
  'destructive',
  'destructive-soft',
  'destructive-border',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'info',
  'info-soft',
  'sidebar',
  'sidebar-foreground',
  'scrollbar',
  'scrollbar-hover',
] as const;

export type SysVar = (typeof SYS_VARS)[number];

export const SYSTEM_THEMES: SystemTheme[] = [
  {
    key: 'day',
    ar: 'نهاري',
    note: 'أسود على أبيض وسماويّ هادئ — للمكاتب المضيئة وللشاشات التي تُقرأ من بعيد.',
    dark: false,
    vars: {
      background: '#f6f7f8',
      card: '#ffffff',
      surface: '#f6f7f8',
      'surface-strong': '#edeef0',
      heading: '#0e1013',
      foreground: '#3b3f45',
      'muted-foreground': '#6b7078',
      muted: '#9aa0a8',
      border: '#e3e5e8',
      'border-strong': '#cdd0d5',
      primary: '#17708f',
      'primary-foreground': '#ffffff',
      'primary-soft': '#eaf3f7',
      destructive: '#c2413f',
      'destructive-soft': '#fbeceb',
      'destructive-border': '#f0cfcd',
      success: '#2e7d52',
      'success-soft': '#eaf4ee',
      warning: '#9a6a1f',
      'warning-soft': '#f9f2e4',
      info: '#4a5580',
      'info-soft': '#eeeff5',
      sidebar: '#0e1013',
      'sidebar-foreground': '#d5d8dc',
      scrollbar: '#cdd0d5',
      'scrollbar-hover': '#9aa0a8',
    },
  },
  {
    key: 'ops',
    ar: 'غرفة العمليات',
    note: 'أسود شبه تام وسماويّ مرفوع — لمن يجلس أمام الشاشة اليوم كلّه.',
    dark: true,
    vars: {
      background: '#0b0c0e',
      card: '#131518',
      surface: '#17191d',
      'surface-strong': '#1f2228',
      heading: '#eceef1',
      foreground: '#c0c4ca',
      'muted-foreground': '#8b9098',
      muted: '#696e76',
      border: '#262a30',
      'border-strong': '#363b43',
      primary: '#4fb3dc',
      'primary-foreground': '#06181f',
      'primary-soft': '#10242d',
      destructive: '#f0736f',
      'destructive-soft': '#2a1514',
      'destructive-border': '#4a2523',
      success: '#4cc98a',
      'success-soft': '#10251a',
      warning: '#e3ad63',
      'warning-soft': '#261e12',
      info: '#9aa4cf',
      'info-soft': '#181a24',
      sidebar: '#08090b',
      'sidebar-foreground': '#c0c4ca',
      scrollbar: '#262a30',
      'scrollbar-hover': '#363b43',
    },
  },
  {
    key: 'calm',
    ar: 'هادئ',
    note: 'رماديّ فاتح وتباين أقل — لمن يتعب من الأبيض الصريح.',
    dark: false,
    vars: {
      background: '#f2f4f6',
      card: '#fafbfc',
      surface: '#eef1f4',
      'surface-strong': '#e5e9ed',
      heading: '#1b1f24',
      foreground: '#464b52',
      'muted-foreground': '#676d75',
      muted: '#9aa1a9',
      border: '#dde2e7',
      'border-strong': '#c8cfd6',
      primary: '#1d6d88',
      'primary-foreground': '#fafbfc',
      'primary-soft': '#e7f0f4',
      destructive: '#b64a48',
      'destructive-soft': '#f7ebea',
      'destructive-border': '#e8cdcc',
      success: '#35795a',
      'success-soft': '#e9f2ec',
      warning: '#8e6726',
      'warning-soft': '#f6f0e3',
      info: '#4f5a80',
      'info-soft': '#edeef4',
      sidebar: '#1b1f24',
      'sidebar-foreground': '#dde2e7',
      scrollbar: '#c8cfd6',
      'scrollbar-hover': '#9aa1a9',
    },
  },
];

/** The one everybody gets until they choose. */
export const DEFAULT_THEME = 'day';

export function themeByKey(key: string | null | undefined): SystemTheme {
  return SYSTEM_THEMES.find((t) => t.key === key) ?? SYSTEM_THEMES.find((t) => t.key === DEFAULT_THEME)!;
}

/** Only a key this build knows — a stored typo must not blank the screen. */
export function sanitizeTheme(raw: unknown): string {
  return SYSTEM_THEMES.some((t) => t.key === raw) ? (raw as string) : DEFAULT_THEME;
}

/** The theme as CSS custom properties, for a <style> tag or a style attribute. */
export function themeCss(theme: SystemTheme): string {
  return SYS_VARS.map((name) => `--sys-${name}:${theme.vars[name]}`).join(';');
}
