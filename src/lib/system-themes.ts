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
 * The store's own look is a separate family entirely (`--store-*`, see
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
  /*
   * A FIELD'S OWN EDGE — AND IT USED TO BE AN ALIAS, WHICH WAS A BUG.
   *
   * It was declared `--sys-border-input: var(--sys-muted)` on `:root` and
   * repeated in each palette's block. Custom properties substitute at
   * COMPUTED-VALUE time, on the element that declares them — so a palette
   * that did not repeat the line inherited the value the ROOT computed,
   * which is the DEFAULT theme's muted, not its own. While every palette
   * lived in the stylesheet and repeated the line, nothing showed. The
   * moment a palette is written by the frame instead, every field on nine
   * themes would have been outlined in the default's grey.
   *
   * So it is a value like the others, per theme, and the indirection is
   * gone. One name, one hex, no element-dependent resolution.
   */
  'border-input',
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
  /*
   * THE SIDEBAR'S OWN THUMB — the same alias trap as `border-input`.
   *
   * Declared `var(--sys-scrollbar)` on the default's rule and repeated in
   * each palette's block. A custom property substitutes at
   * computed-value time on the element that declares it, so a palette
   * that does not repeat the line inherits the DEFAULT's scrollbar. It is
   * also the fault that put this name here in the first place: it was
   * read twice by `.sidebar-scroll` and declared nowhere, so the browser
   * drew its own thumb. Per theme, written out, both of them.
   */
  'sidebar-scrollbar',
  'sidebar-scrollbar-hover',
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
      'border-input': '#7b8e9c',
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
      'scrollbar': '#1C3A52',
      'scrollbar-hover': '#597183',
      'sidebar-scrollbar': '#1C3A52',
      'sidebar-scrollbar-hover': '#597183',
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
      'border-input': '#5f6c75',
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
      'scrollbar': '#D5E1E6',
      'scrollbar-hover': '#99acba',
      'sidebar-scrollbar': '#D5E1E6',
      'sidebar-scrollbar-hover': '#99acba',
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
      'border-input': '#5d6262',
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
      'scrollbar': '#D8CEBC',
      'scrollbar-hover': '#9b9f9c',
      'sidebar-scrollbar': '#D8CEBC',
      'sidebar-scrollbar-hover': '#9b9f9c',
      'shadow-raised': '0 1px 2px rgb(12 50 82 / 0.05), 0 1px 3px rgb(12 50 82 / 0.07)',
      'shadow-overlay': '0 2px 6px rgb(12 50 82 / 0.06), 0 12px 32px rgb(12 50 82 / 0.12)',
    },
  },

  /*
   * ══════════════════════════════════════════════════════════════════════
   * THE EIGHT THE OWNER ASKED FOR — HIS OWN, AND ONLY HIS OWN.
   *
   * These are the palettes designed for his PC application. Not one mark,
   * character, likeness or name belongs to any game, film, show or living
   * person: a key is `city90`, not the city; `space`, not the franchise.
   * What was taken is a MOOD and a pair of hexes, and a mood is nobody's
   * property.
   *
   * ── AND NOT ONE OF THEM MOVES A MEANING ──
   *
   * Every value below was DERIVED, not picked: the seed hexes were walked
   * along their own hue until every gate in `system-themes.test.ts`
   * passed — AA 4.5 for text, 3:1 for a chart series and a focus ring,
   * amber for «needs attention», red for «late or money lost», green for
   * «collected». 296 values by hand would have shipped a dozen pairs at
   * 4.2:1 that nobody measured.
   *
   * ⚠️ A series' hue sits in 175°–335° in every one of them — clear of
   * red, of amber and of green — so a line on a chart cannot be read as a
   * warning. A GOLD accent («إسلامي ملحمي», «ملحمة») therefore does NOT
   * lead its own chart series: gold is amber's band. It hands the lead to
   * its complement.
   * ══════════════════════════════════════════════════════════════════════
   */
  {
    key: 'cyber',
    ar: 'سايبربنك',
    note: 'نيونٌ على أسود — لليل، ولمن يشتغل والضوءُ مطفأ.',
    dark: true,
    vars: {
      background: '#06060C',
      card: '#0D0D18',
      surface: '#1E1E28',
      'surface-strong': '#2F2F38',
      border: '#3D3D46',
      'border-strong': '#7A7A80',
      heading: '#E7EEEE',
      foreground: '#E7EEEE',
      'muted-foreground': '#A2C1C3',
      'border-input': '#8BA6A7',
      muted: '#8BA6A7',
      primary: '#00F0FF',
      'primary-foreground': '#0A0A0A',
      'primary-hover': '#29F2FF',
      'primary-soft': '#0B313D',
      focus: '#00F0FF',
      warning: '#DB9824',
      'warning-soft': '#2A201A',
      destructive: '#DF4537',
      'destructive-soft': '#2A151C',
      'destructive-border': '#5D2224',
      success: '#24DB70',
      'success-soft': '#102A24',
      'chart-1': '#62D3DA',
      'chart-2': '#62A8DA',
      'chart-3': '#A862DA',
      'chart-4': '#DA62C6',
      'chart-5': '#62C6DA',
      'chart-6': '#6262DA',
      sidebar: '#0A0A12',
      'sidebar-foreground': '#A2C1C3',
      'scrollbar': '#42424B',
      'scrollbar-hover': '#6E6E74',
      'sidebar-scrollbar': '#42424B',
      'sidebar-scrollbar-hover': '#6E6E74',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.50), 0 1px 3px rgb(0 0 0 / 0.28)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.62), 0 4px 6px -4px rgb(0 0 0 / 0.44)',
    },
  },
  {
    key: 'islamic-epic',
    ar: 'إسلامي ملحمي',
    note: 'كحليٌّ وذهب — زخرفةٌ على الباب، وأرقامٌ هادئةٌ في الداخل.',
    dark: true,
    vars: {
      background: '#0A1430',
      card: '#101C40',
      surface: '#212C4D',
      'surface-strong': '#313C5B',
      border: '#404966',
      'border-strong': '#7C8296',
      heading: '#EEECE7',
      foreground: '#EEECE7',
      'muted-foreground': '#C3B9A2',
      'border-input': '#A79F8B',
      muted: '#A79F8B',
      primary: '#D4AF5A',
      'primary-foreground': '#0A0A0A',
      'primary-hover': '#DCBF7A',
      'primary-soft': '#2F3444',
      focus: '#D4AF5A',
      warning: '#DB9824',
      'warning-soft': '#2C2D3C',
      destructive: '#E4585D',
      'destructive-soft': '#2E2444',
      'destructive-border': '#61334B',
      success: '#24DB70',
      'success-soft': '#133747',
      'chart-1': '#6286DA',
      'chart-2': '#62A8DA',
      'chart-3': '#A862DA',
      'chart-4': '#DA62C6',
      'chart-5': '#62C6DA',
      'chart-6': '#6262DA',
      sidebar: '#0D1838',
      'sidebar-foreground': '#C3B9A2',
      'scrollbar': '#454E6A',
      'scrollbar-hover': '#70778C',
      'sidebar-scrollbar': '#454E6A',
      'sidebar-scrollbar-hover': '#70778C',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.52), 0 1px 3px rgb(0 0 0 / 0.30)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.64), 0 4px 6px -4px rgb(0 0 0 / 0.46)',
    },
  },
  {
    key: 'islamic-calm',
    ar: 'إسلامي هادي',
    note: 'ورقٌ عاجيٌّ وأخضرُ عميق — نهاريّ، وأخفُّ على العين في الشمس.',
    dark: false,
    vars: {
      background: '#F6F1E7',
      card: '#FFFFFF',
      surface: '#F2F2F2',
      'surface-strong': '#E6E6E6',
      border: '#DBDBDB',
      'border-strong': '#999999',
      heading: '#1D2A29',
      foreground: '#1D2A29',
      /*
       * DARKER BY 12%, FOR THE ORNAMENT THAT NOW SITS UNDER IT.
       *
       * It was #48706B — 4.90:1 on this theme's paper, which is a pass with
       * 0.4 to spare and nothing for a drawing to take. The door's
       * tagline and its footer line are THIS colour, outside the card, and
       * the theme's rosette is drawn behind them: at the opacity it is set
       * to, a line passing under a letter takes the contrast to 3.96:1.
       * #3F635E is 5.93 on the paper and 4.79 under the rosette's worst
       * case, which is what `a-theme-wears-its-own-ornament.test.ts`
       * computes and holds. The hierarchy survives: it is still lighter
       * than `foreground` and still green, only less pale.
       */
      'muted-foreground': '#3F635E',
      'border-input': '#55716E',
      muted: '#55716E',
      primary: '#0E5E55',
      'primary-foreground': '#FFFFFF',
      'primary-hover': '#093A35',
      'primary-soft': '#D8E5E4',
      focus: '#0E5E55',
      warning: '#916418',
      'warning-soft': '#F0E9DF',
      destructive: '#CC2F21',
      'destructive-soft': '#F8E2E0',
      'destructive-border': '#ECB0AB',
      success: '#147D40',
      'success-soft': '#DEEDE4',
      'chart-1': '#6029AE',
      'chart-2': '#2976AE',
      'chart-3': '#7629AE',
      'chart-4': '#AE2997',
      'chart-5': '#2997AE',
      'chart-6': '#2929AE',
      sidebar: '#F9F6EF',
      'sidebar-foreground': '#48706B',
      'scrollbar': '#D6D6D6',
      'scrollbar-hover': '#ADADAD',
      'sidebar-scrollbar': '#D6D6D6',
      'sidebar-scrollbar-hover': '#ADADAD',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.54), 0 1px 3px rgb(0 0 0 / 0.32)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.66), 0 4px 6px -4px rgb(0 0 0 / 0.48)',
    },
  },
  {
    key: 'space',
    ar: 'كواكب ومجرّات',
    note: 'سماءٌ بلا قمر — بنفسجيٌّ وسماويٌّ على سوادٍ أزرق.',
    dark: true,
    vars: {
      background: '#040714',
      card: '#0B1030',
      surface: '#1C213E',
      'surface-strong': '#2D314D',
      border: '#3C4059',
      'border-strong': '#797C8D',
      heading: '#E8E7EE',
      foreground: '#E8E7EE',
      'muted-foreground': '#A6A2C3',
      'border-input': '#8E8BA7',
      muted: '#8E8BA7',
      primary: '#8B7BFF',
      'primary-foreground': '#0A0A0A',
      'primary-hover': '#AFA4FF',
      'primary-soft': '#1F2151',
      focus: '#8B7BFF',
      warning: '#DB9824',
      'warning-soft': '#28232E',
      destructive: '#E1474C',
      'destructive-soft': '#291834',
      'destructive-border': '#5C253B',
      success: '#24DB70',
      'success-soft': '#0E2C39',
      'chart-1': '#7162DA',
      'chart-2': '#62A8DA',
      'chart-3': '#A862DA',
      'chart-4': '#DA62C6',
      'chart-5': '#62C6DA',
      'chart-6': '#6262DA',
      sidebar: '#080C22',
      'sidebar-foreground': '#A6A2C3',
      'scrollbar': '#41455E',
      'scrollbar-hover': '#6D7083',
      'sidebar-scrollbar': '#41455E',
      'sidebar-scrollbar-hover': '#6D7083',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.56), 0 1px 3px rgb(0 0 0 / 0.34)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.68), 0 4px 6px -4px rgb(0 0 0 / 0.50)',
    },
  },
  {
    key: 'sea',
    ar: 'مغامرة بحريّة',
    note: 'ورقُ خريطةٍ وحبرٌ بحريّ — نهاريٌّ دافئ.',
    dark: false,
    vars: {
      background: '#EADBB8',
      card: '#FBF4E4',
      surface: '#EEE8D9',
      'surface-strong': '#E2DCCD',
      border: '#D8D2C4',
      'border-strong': '#979289',
      heading: '#1D272A',
      foreground: '#1D272A',
      'muted-foreground': '#44626A',
      'border-input': '#4F6369',
      muted: '#4F6369',
      primary: '#0F4C5C',
      'primary-foreground': '#FFFFFF',
      'primary-hover': '#092F39',
      'primary-soft': '#D5D9CE',
      focus: '#0F4C5C',
      warning: '#7F5815',
      'warning-soft': '#EADEC7',
      destructive: '#B42A1D',
      'destructive-soft': '#F1D8C8',
      'destructive-border': '#E0A798',
      success: '#126E38',
      'success-soft': '#DAE1CC',
      'chart-1': '#2992AE',
      'chart-2': '#2976AE',
      'chart-3': '#7629AE',
      'chart-4': '#AE2997',
      'chart-5': '#2893AA',
      'chart-6': '#2929AE',
      sidebar: '#F0E4C7',
      'sidebar-foreground': '#44626A',
      'scrollbar': '#D3CDC0',
      'scrollbar-hover': '#ABA69B',
      'sidebar-scrollbar': '#D3CDC0',
      'sidebar-scrollbar-hover': '#ABA69B',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.58), 0 1px 3px rgb(0 0 0 / 0.36)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.70), 0 4px 6px -4px rgb(0 0 0 / 0.52)',
    },
  },
  {
    key: 'city90',
    ar: 'مدينة التسعينات',
    note: 'نيونُ مدينةٍ ليلاً — قرنفليٌّ وسماويٌّ على بنفسجيٍّ غامق.',
    dark: true,
    vars: {
      background: '#160A2B',
      card: '#1F0F36',
      surface: '#2F2044',
      'surface-strong': '#3E3152',
      border: '#4C3F5E',
      'border-strong': '#847B90',
      heading: '#EEE7EA',
      foreground: '#EEE7EA',
      'muted-foreground': '#C3A2AF',
      'border-input': '#A78B96',
      muted: '#A78B96',
      primary: '#FF3D8B',
      'primary-foreground': '#0A0A0A',
      'primary-hover': '#FF66A3',
      'primary-soft': '#431644',
      focus: '#FF3D8B',
      warning: '#DB9824',
      'warning-soft': '#392233',
      destructive: '#E25054',
      'destructive-soft': '#3A183A',
      'destructive-border': '#692841',
      success: '#24DB70',
      'success-soft': '#202C3E',
      'chart-1': '#9462DA',
      'chart-2': '#62A8DA',
      'chart-3': '#A862DA',
      'chart-4': '#DA62C6',
      'chart-5': '#62C6DA',
      'chart-6': '#6262DA',
      sidebar: '#1A0C30',
      'sidebar-foreground': '#C3A2AF',
      'scrollbar': '#504462',
      'scrollbar-hover': '#796F86',
      'sidebar-scrollbar': '#504462',
      'sidebar-scrollbar-hover': '#796F86',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.60), 0 1px 3px rgb(0 0 0 / 0.38)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.72), 0 4px 6px -4px rgb(0 0 0 / 0.54)',
    },
  },
  {
    key: 'epic',
    ar: 'ملحمة',
    note: 'فحمٌ وذهبٌ قديم — داكنٌ وهادئ، للشاشات الكبيرة.',
    dark: true,
    vars: {
      background: '#0D0B0A',
      card: '#1D1510',
      surface: '#2D2521',
      'surface-strong': '#3D3631',
      border: '#4A4440',
      'border-strong': '#837E7C',
      heading: '#EEECE7',
      foreground: '#EEECE7',
      'muted-foreground': '#C3B8A2',
      'border-input': '#A79E8B',
      muted: '#A79E8B',
      primary: '#E0B252',
      'primary-foreground': '#0A0A0A',
      'primary-hover': '#E6C175',
      'primary-soft': '#3C2E1B',
      focus: '#E0B252',
      warning: '#DB9824',
      'warning-soft': '#382713',
      destructive: '#E05042',
      'destructive-soft': '#381D17',
      'destructive-border': '#672B23',
      success: '#24DB70',
      'success-soft': '#1E311D',
      'chart-1': '#6289DA',
      'chart-2': '#62A8DA',
      'chart-3': '#A862DA',
      'chart-4': '#DA62C6',
      'chart-5': '#62C6DA',
      'chart-6': '#6262DA',
      sidebar: '#15100D',
      'sidebar-foreground': '#C3B8A2',
      'scrollbar': '#4F4845',
      'scrollbar-hover': '#777370',
      'sidebar-scrollbar': '#4F4845',
      'sidebar-scrollbar-hover': '#777370',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.62), 0 1px 3px rgb(0 0 0 / 0.40)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.74), 0 4px 6px -4px rgb(0 0 0 / 0.56)',
    },
  },
  {
    key: 'lux',
    ar: 'فخامة',
    note: 'نبيذيٌّ وذهبٌ ورديّ — نهاريٌّ فخم، وأقلُّ ضجيجاً.',
    dark: false,
    vars: {
      background: '#FBF1EC',
      card: '#FFFCFA',
      surface: '#F2EFEE',
      'surface-strong': '#E6E3E1',
      border: '#DBD9D7',
      'border-strong': '#999796',
      heading: '#2A1D24',
      foreground: '#2A1D24',
      'muted-foreground': '#70485D',
      'border-input': '#806071',
      muted: '#806071',
      primary: '#5B2340',
      'primary-foreground': '#FFFFFF',
      'primary-hover': '#3E182B',
      'primary-soft': '#E5D9DC',
      focus: '#5B2340',
      warning: '#916418',
      'warning-soft': '#F0E7DA',
      destructive: '#D52329',
      'destructive-soft': '#F9DEDD',
      'destructive-border': '#EFAAAB',
      success: '#147D40',
      'success-soft': '#DEEAE0',
      'chart-1': '#AE296D',
      'chart-2': '#2976AE',
      'chart-3': '#7629AE',
      'chart-4': '#AE2997',
      'chart-5': '#2997AE',
      'chart-6': '#2929AE',
      sidebar: '#FCF5F1',
      'sidebar-foreground': '#70485D',
      'scrollbar': '#D6D4D2',
      'scrollbar-hover': '#ADABAA',
      'sidebar-scrollbar': '#D6D4D2',
      'sidebar-scrollbar-hover': '#ADABAA',
      'shadow-raised': '0 1px 2px rgb(0 0 0 / 0.64), 0 1px 3px rgb(0 0 0 / 0.42)',
      'shadow-overlay': '0 10px 15px -3px rgb(0 0 0 / 0.76), 0 4px 6px -4px rgb(0 0 0 / 0.58)',
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

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHICH PALETTES THE STYLESHEET CARRIES — AND WHY IT IS NOT ALL OF THEM.
 *
 * `system.css` is in the FIRST-LOAD payload: every byte of it reaches
 * everybody, whichever theme they chose. With three palettes that was
 * 2.6 KB of colours nine people in ten never see. With eleven it would be
 * ten, and `quality-gates.test.ts` caps the sheet at 96.13 KB for a reason
 * — its own failure message has said all along that the way down is «فصلُ
 * لوحاتِ الألوانِ غيرِ المختارة».
 *
 * So the sheet carries exactly two things:
 *   • the DEFAULT, under `:root` as well, so a page with no attribute —
 *     an error screen, a page rendered outside the system layout — still
 *     has colours;
 *   • `auto`, because «follow the device» has to be answered by a MEDIA
 *     QUERY. A theme applied by script flashes the default first, and a
 *     phone in night mode would be shown a white screen at four in the
 *     morning, every time.
 *
 * Every other palette is written into the document by `SystemFrame`, as
 * the one rule for the one theme that person chose. It is in the same HTML
 * response, so the first paint is still correct and nothing flashes — and
 * a ninth, a tenth and an eleventh theme now cost the eighth's bytes,
 * which is nothing.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const SHEET_THEMES = [DEFAULT_THEME, AUTO_THEME] as const;

/**
 * The whole rule for one theme — selector, palette, and the scheme its
 * native controls are drawn in.
 *
 * `color-scheme` is INSIDE the rule and never in one of its own. A
 * checkbox, a radio, a date picker's calendar and the popup a `<select>`
 * opens are drawn by the user agent, not by CSS; a theme whose surfaces
 * are light and whose controls are dark is exactly the bug co-location
 * prevents.
 *
 * Returns `''` for a theme the sheet already carries, so nothing is ever
 * declared twice, and for an unknown key, so a stored typo adds nothing
 * rather than adding a broken rule.
 */
export function themeStyle(key: string | null | undefined): string {
  if (!key || (SHEET_THEMES as readonly string[]).includes(key)) return '';
  const theme = SYSTEM_THEMES.find((t) => t.key === key);
  if (!theme) return '';
  /*
   * ── AND ON `:root` TOO, BECAUSE `body` IS NOT INSIDE THE FRAME ──
   *
   * `body { background-color: var(--sys-background) }` is in the sheet, and
   * `body` is the frame div's ANCESTOR — so it reads the value `:root`
   * computed, which is the DEFAULT theme's. Measured in the browser while
   * the frame itself was correctly painted in «مغامرة بحريّة»: every
   * `--sys-*` on the div had switched, and `body` was still navy.
   *
   * It has been invisible because the div is `min-h-screen` and paints its
   * own background over the whole viewport — so what showed was the
   * overscroll gutter, the area behind a rubber-band on a phone, and the
   * colour the browser hands the compositor. It would have been visible on
   * all nine new palettes, and it was already true of «نهاري» and «هادئ».
   *
   * Both selectors in one rule: one theme is active per document, so there
   * is nothing for the root declaration to collide with.
   */
  return `:root,[data-sys-theme='${theme.key}']{color-scheme:${theme.dark ? 'dark' : 'light'};${themeCss(theme)}}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHICH LOOK THIS PERSON OPENS ON — three answers, in order.
 *
 *   1. what THEY chose,
 *   2. what the OWNER set for their role,
 *   3. the product's default.
 *
 * The same shape the menu arrangement already has: a base the owner
 * publishes to a role, and a personal choice that sits on top of it. A new
 * agent's first morning is then the look their job is meant to have, and
 * the first time they pick one of their own, the base stops being read for
 * them — it is not a cage.
 *
 * ⚠️ Both are sanitized, and SEPARATELY. `sanitizeTheme` answers «the
 * default» for anything it does not know, so running the person's null
 * through it first would return the default and the role's base would
 * never be reached. The question «did this person choose?» has to be asked
 * before the question «is what they chose valid?».
 * ═══════════════════════════════════════════════════════════════════════
 */
export function openingTheme(own: string | null | undefined, roleBase: string | null | undefined): string {
  if (own) return sanitizeTheme(own);
  if (roleBase) return sanitizeTheme(roleBase);
  return DEFAULT_THEME;
}
