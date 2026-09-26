/**
 * THE LOOKS OF THE SYSTEM — AND ONE MEANING FOR EVERY COLOUR.
 *
 * THE BRAND. Zakai.io: a navy wordmark, a cyan-to-petrol mark. Petrol is
 * the action on light surfaces, cyan the action on dark ones, glow the
 * highlight a focus ring uses. The identity appears at the door — login,
 * the country and store pickers, the splash — and nowhere else. On a screen
 * showing orders, money or stock there is no gradient and no glow: the
 * brand earns attention at the door; inside, the numbers do.
 *
 * ROLES, NOT COLOURS. Nothing here is named for what it looks like. A theme
 * moves the SURFACES; the meanings do not move. Amber is always "needs
 * attention", red is always "late, or money lost", green is always
 * "collected", and the accent is always "this is the action".
 *
 * THERE IS NO BLUE "INFO". It would sit beside the brand cyan and blur the
 * one line that matters — the line between something to press and something
 * to read. An informational note is surface-2 with secondary text.
 *
 * TEXT ON THE CYAN ACCENT IS NAVY, NEVER WHITE. White on cyan measures
 * 2.4:1 and fails; navy measures 7.4:1. The dark theme's accent-contrast is
 * therefore near-black, and system-themes.test.ts refuses anything else.
 *
 * EVERY PAIR IS MEASURED. Each text/background combination clears WCAG AA
 * 4.5:1 in all three palettes, and every chart series clears 3:1 against
 * the card it is drawn on. Where a brand hex could not clear the gate on a
 * given surface, it was walked along its own hue until it did — the gate is
 * the rule, the hex was the starting point.
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
  'border',
  'border-strong',
  'heading',
  'foreground',
  'muted-foreground',
  'muted',
  'primary',
  'primary-foreground',
  'primary-hover',
  'primary-soft',
  'focus',
  'warning',
  'warning-soft',
  'destructive',
  'destructive-soft',
  'destructive-border',
  'success',
  'success-soft',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'sidebar',
  'sidebar-foreground',
  'scrollbar',
  'scrollbar-hover',
  // Depth, per theme, because a shadow that works on white is invisible on
  // black. Three levels and no more: flat is the absence of both.
  'shadow-raised',
  'shadow-overlay',
] as const;

export type SysVar = (typeof SYS_VARS)[number];

/**
 * THE SIX CHART SERIES.
 *
 * Derived from the brand and deliberately EXCLUDING the three semantic
 * hues, so a line on a chart is never mistaken for a warning. Each one is
 * tuned per theme until it clears 3:1 on the surface it is drawn on.
 */
export const CHART_SERIES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'] as const;

export const SYSTEM_THEMES: SystemTheme[] = [
  {
    key: 'ops',
    ar: 'غرفة العمليات',
    note: 'ليل عميق وسماويّ برّاق — الافتراضي، ولمن يجلس أمام الشاشة اليوم كلّه.',
    dark: true,
    vars: {
      background: '#050F1F',
      card: '#0A1A2E',
      surface: '#0F2438',
      'surface-strong': '#16304A',
      border: '#1C3A52',
      'border-strong': '#486276',
      heading: '#E6F1F4',
      foreground: '#E6F1F4',
      'muted-foreground': '#9FB6C2',
      muted: '#7b8e9c',
      primary: '#36B5CC',
      'primary-foreground': '#04182B',
      'primary-hover': '#60DADB',
      'primary-soft': '#0e2a3e',
      focus: '#60DADB',
      warning: '#E8973A',
      'warning-soft': '#20262f',
      destructive: '#e65e52',
      'destructive-soft': '#202132',
      'destructive-border': '#55313a',
      success: '#4FB865',
      'success-soft': '#112a34',
      'chart-1': '#36B5CC',
      'chart-2': '#2c6f8c',
      'chart-3': '#8E7CC3',
      'chart-4': '#C9A36A',
      'chart-5': '#7A93A6',
      'chart-6': '#C97A94',
      sidebar: '#0A1A2E',
      'sidebar-foreground': '#9FB6C2',
      scrollbar: '#1C3A52',
      'scrollbar-hover': '#597183',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.55)',
      'shadow-overlay': '0 2px 8px rgb(0 0 0 / 0.45), 0 16px 40px rgb(0 0 0 / 0.65)',
    },
  },
  {
    key: 'day',
    ar: 'نهاري',
    note: 'أبيض ونيليّ وبترولي — للمكاتب المضيئة وللشاشات التي تُقرأ من بعيد.',
    dark: false,
    vars: {
      background: '#FFFFFF',
      card: '#F4F8FA',
      surface: '#E9F0F3',
      'surface-strong': '#DCE7EC',
      border: '#D5E1E6',
      'border-strong': '#a9bac5',
      heading: '#0C3252',
      foreground: '#0C3252',
      'muted-foreground': '#4A6272',
      muted: '#5f6c75',
      primary: '#1A6382',
      'primary-foreground': '#FFFFFF',
      'primary-hover': '#176079',
      'primary-soft': '#e9f1f4',
      focus: '#1A6382',
      warning: '#9A5B12',
      'warning-soft': '#f0f0ee',
      destructive: '#B42318',
      'destructive-soft': '#f1edef',
      'destructive-border': '#deb0ad',
      success: '#1E7A3A',
      'success-soft': '#e9f2f0',
      'chart-1': '#2e9aad',
      'chart-2': '#1A6382',
      'chart-3': '#8E7CC3',
      'chart-4': '#a48456',
      'chart-5': '#758d9f',
      'chart-6': '#c1758e',
      sidebar: '#F4F8FA',
      'sidebar-foreground': '#4A6272',
      scrollbar: '#D5E1E6',
      'scrollbar-hover': '#99acba',
      'shadow-raised': '0 1px 2px rgb(12 50 82 / 0.06), 0 1px 3px rgb(12 50 82 / 0.08)',
      'shadow-overlay': '0 2px 6px rgb(12 50 82 / 0.07), 0 12px 32px rgb(12 50 82 / 0.14)',
    },
  },
  {
    key: 'calm',
    ar: 'هادئ',
    note: 'ورقيّ دافئ وتباين أقلّ — لمن يتعب من الأبيض الصريح.',
    dark: false,
    vars: {
      background: '#F6F2EA',
      card: '#EFE9DE',
      surface: '#E6DECF',
      'surface-strong': '#DDD3C2',
      border: '#D8CEBC',
      'border-strong': '#abaca5',
      heading: '#0C3252',
      foreground: '#0C3252',
      'muted-foreground': '#566369',
      muted: '#5d6262',
      primary: '#1A6382',
      'primary-foreground': '#FFFFFF',
      'primary-hover': '#176079',
      'primary-soft': '#e4e2d9',
      focus: '#1A6382',
      warning: '#8e5410',
      'warning-soft': '#eae2d4',
      destructive: '#B42318',
      'destructive-soft': '#ecdfd4',
      'destructive-border': '#dba69b',
      success: '#1c7036',
      'success-soft': '#e4e3d6',
      'chart-1': '#2a8e9f',
      'chart-2': '#1A6382',
      'chart-3': '#8877bb',
      'chart-4': '#9d7f53',
      'chart-5': '#708799',
      'chart-6': '#b97088',
      sidebar: '#EFE9DE',
      'sidebar-foreground': '#566369',
      scrollbar: '#D8CEBC',
      'scrollbar-hover': '#9b9f9c',
      'shadow-raised': '0 1px 2px rgb(12 50 82 / 0.05), 0 1px 3px rgb(12 50 82 / 0.07)',
      'shadow-overlay': '0 2px 6px rgb(12 50 82 / 0.06), 0 12px 32px rgb(12 50 82 / 0.12)',
    },
  },
];

/**
 * WHAT THE PICKER OFFERS — three palettes and one instruction.
 *
 * `auto` is not a palette. It is "use the one the device is in", resolved
 * by a media query in the stylesheet rather than by a script, so a phone in
 * night mode opens dark on the FIRST paint instead of flashing white at
 * somebody at four in the morning.
 */
export const AUTO_THEME = 'auto';

export const THEME_CHOICES: { key: string; ar: string; note: string }[] = [
  ...SYSTEM_THEMES.map((t) => ({ key: t.key, ar: t.ar, note: t.note })),
  { key: AUTO_THEME, ar: 'تلقائي', note: 'يتبع الجهاز — داكنٌ ليلاً، فاتحٌ نهاراً.' },
];

/** The one everybody gets until they choose. */
export const DEFAULT_THEME = 'ops';

/** Which palette `auto` resolves to, by the device's own setting. */
export const AUTO_DARK = 'ops';
export const AUTO_LIGHT = 'day';

export function themeByKey(key: string | null | undefined): SystemTheme {
  return SYSTEM_THEMES.find((t) => t.key === key) ?? SYSTEM_THEMES.find((t) => t.key === DEFAULT_THEME)!;
}

/** Only a key this build knows — a stored typo must not blank the screen. */
export function sanitizeTheme(raw: unknown): string {
  if (raw === AUTO_THEME) return AUTO_THEME;
  return SYSTEM_THEMES.some((t) => t.key === raw) ? (raw as string) : DEFAULT_THEME;
}

/** The theme as CSS custom properties, for a <style> tag or a style attribute. */
export function themeCss(theme: SystemTheme): string {
  return SYS_VARS.map((name) => `--sys-${name}:${theme.vars[name]}`).join(';');
}
