/**
 * THREE LOOKS FOR THE SYSTEM — AND ONE MEANING FOR EVERY COLOUR.
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
    note: 'فاتح وعالي الوضوح — للمكاتب المضيئة وللشاشات التي تُقرأ من بعيد.',
    dark: false,
    vars: {
      background: '#f8fafc',
      card: '#ffffff',
      surface: '#f8fafc',
      'surface-strong': '#f1f3f6',
      heading: '#121926',
      foreground: '#364152',
      'muted-foreground': '#697586',
      muted: '#9aa4b2',
      border: '#e3e8ef',
      'border-strong': '#cdd5df',
      primary: '#b8256e',
      'primary-foreground': '#ffffff',
      'primary-soft': '#fdf2f8',
      destructive: '#fb323f',
      'destructive-soft': '#feecee',
      'destructive-border': '#fecdd1',
      success: '#00a344',
      'success-soft': '#e6f9ee',
      warning: '#c07f2a',
      'warning-soft': '#fffbeb',
      info: '#13b5fe',
      'info-soft': '#eef4ff',
      sidebar: '#121926',
      'sidebar-foreground': '#e3e8ef',
      scrollbar: '#cdd5df',
      'scrollbar-hover': '#9aa4b2',
    },
  },
  {
    key: 'ops',
    ar: 'غرفة العمليات',
    note: 'داكن وقليل الوهج — لمن يجلس أمام الشاشة اليوم كلّه.',
    dark: true,
    vars: {
      background: '#0f141b',
      card: '#161d26',
      surface: '#1b232e',
      'surface-strong': '#222c39',
      heading: '#eef2f6',
      foreground: '#c3ccd6',
      'muted-foreground': '#8e9aa8',
      muted: '#6b7683',
      border: '#2a3541',
      'border-strong': '#3a4756',
      // Lifted, because the day palette's pink disappears against a dark
      // surface — the same meaning, made legible where it now sits.
      primary: '#e4589b',
      'primary-foreground': '#12060c',
      'primary-soft': '#2a1622',
      destructive: '#ff6b74',
      'destructive-soft': '#2c1518',
      'destructive-border': '#4d2429',
      success: '#3ddc84',
      'success-soft': '#12251a',
      warning: '#f0b357',
      'warning-soft': '#2a2013',
      info: '#5cc8ff',
      'info-soft': '#12202c',
      sidebar: '#0b1017',
      'sidebar-foreground': '#c3ccd6',
      scrollbar: '#2a3541',
      'scrollbar-hover': '#3a4756',
    },
  },
  {
    key: 'calm',
    ar: 'هادئ',
    note: 'محايد دافئ وتباين أقل — لمن يتعب من الأبيض الصريح.',
    dark: false,
    vars: {
      background: '#f7f5f2',
      card: '#fffdfb',
      surface: '#f3f0ec',
      'surface-strong': '#ebe7e1',
      heading: '#2b2724',
      foreground: '#4a443e',
      'muted-foreground': '#7a736b',
      muted: '#9c948a',
      border: '#e2ddd6',
      'border-strong': '#cfc8bf',
      primary: '#a8306c',
      'primary-foreground': '#fffdfb',
      'primary-soft': '#f7ecf2',
      destructive: '#c8433f',
      'destructive-soft': '#faeceb',
      'destructive-border': '#eccbc9',
      success: '#2f7d4f',
      'success-soft': '#eaf3ec',
      warning: '#9c6b23',
      'warning-soft': '#f9f1e3',
      info: '#2b7fa8',
      'info-soft': '#eaf0f4',
      sidebar: '#2b2724',
      'sidebar-foreground': '#e2ddd6',
      scrollbar: '#cfc8bf',
      'scrollbar-hover': '#9c948a',
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
