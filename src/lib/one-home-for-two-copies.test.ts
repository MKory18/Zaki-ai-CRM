import { describe, expect, it } from 'vitest';
import { dashboardFiles, repoFile, stripComments } from './guard-source';
import { CHANNEL_KINDS, CHANNEL_KIND_AR } from './order-channel-kinds';
import { withChosen } from '@/components/ui/ListToolbar';

/**
 * TWO THINGS THAT EXISTED TWICE, AND NOW EXIST ONCE (22/10).
 *
 * The duplicate hunt of the restructure (D1–D6) found that no two SCREENS are copies of each other — the lists look alike and ask
 * different questions of different doors, and the money screens must never be merged for the look of it. What it did find were two
 * literal copies, and these are the claims that they stay one:
 *
 *   1. `withChosen` — «the chosen value is always in the box». `ListToolbar` exported it for every list; two of the four lists kept a
 *      byte-identical copy of their own, which is how the next fix to one of them would have missed the others.
 *   2. The order-channel kinds and their labels — the door validated against one list, the screen kept the labels, and the door kept a
 *      third copy of the labels, exported from a route file and read by nobody.
 *
 * Left alone ON PURPOSE, and said here so the next person does not mistake it for an oversight: `rateTone` is in two performance tables
 * and is NOT a copy (the colour for «no rate» differs: `--sys-border-strong` in one, `--sys-muted` in the other — merging them would
 * change one table's look), and the attribution table's labels for the same ten channel kinds differ in four spellings. Which spelling a
 * person reads is the owner's to pick.
 */

describe('`withChosen` is defined once', () => {
  const files = dashboardFiles('both');

  it('— the sweep found files to read', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('— in `ListToolbar`, and nowhere else', () => {
    const definers = files
      .filter((f) => /(?:const|function)\s+withChosen\b/.test(stripComments(f.src)))
      .map((f) => f.rel);
    expect(definers, 'نسخةٌ ثانيةٌ من withChosen').toEqual(['/src/components/ui/ListToolbar.tsx']);
  });

  it('— and the two lists that kept a copy import it instead', () => {
    for (const file of ['src/components/screens/ConfirmationPostponedScreen.tsx', 'src/components/screens/WinbackScreen.tsx']) {
      const src = stripComments(repoFile(file));
      expect(src, file).toMatch(/import \{[^}]*\bwithChosen\b[^}]*\} from '@\/components\/ui\/ListToolbar'/);
      expect(src, `${file}: ما زال عنده تعريفٌ خاصّ`).not.toMatch(/(?:const|function)\s+withChosen\b/);
    }
  });

  it('— and it still does what the four lists were promised: a stale choice stays in the box, with a zero', () => {
    const options = [{ value: 'all', label: 'كل' }, { value: 'a', label: 'أ (3)' }];
    expect(withChosen('a', options)).toBe(options);
    expect(withChosen('all', options)).toBe(options);
    expect(withChosen('gone', options)).toEqual([...options, { value: 'gone', label: 'gone (0)' }]);
  });
});

describe('the order-channel kinds exist once', () => {
  it('— every kind has a name, and no name is for a kind that does not exist', () => {
    expect(CHANNEL_KINDS.length).toBe(10);
    expect(Object.keys(CHANNEL_KIND_AR).sort()).toEqual([...CHANNEL_KINDS].sort());
  });

  it('— the names are the ones the channels screen has always shown, in Arabic', () => {
    expect(CHANNEL_KIND_AR).toEqual({
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
    });
    for (const label of Object.values(CHANNEL_KIND_AR)) expect(label).toMatch(/^[؀-ۿ ]+$/);
  });

  it('— both doors read them from here, and neither route file exports a copy', () => {
    for (const door of ['src/app/api/settings/channels/route.ts', 'src/app/api/settings/channels/[id]/route.ts']) {
      const src = stripComments(repoFile(door));
      expect(src, door).toContain("from '@/lib/order-channel-kinds'");
      expect(src, `${door}: يُصدّر نسخةً`).not.toMatch(/export const CHANNEL_KIND/);
    }
    // …and the second door no longer reaches into the first door's file for a constant.
    expect(stripComments(repoFile('src/app/api/settings/channels/[id]/route.ts'))).not.toContain("from '../route'");
  });

  it('— and the screen reads the names from here and keeps no map of its own', () => {
    const src = stripComments(repoFile('src/components/screens/ChannelsScreen.tsx'));
    expect(src).toContain("import { CHANNEL_KIND_AR as KIND_AR } from '@/lib/order-channel-kinds'");
    expect(src, 'خريطةٌ خاصّةٌ بالشاشة').not.toMatch(/const KIND_AR\b/);
  });

  it('— and the one difference that was left alone on purpose is the one this file says it is', () => {
    // The attribution table spells four of the ten differently. If the owner picks one spelling, this is the claim to change — and
    // the note at the top of `order-channel-kinds.ts` with it. Until then the note must be true.
    const src = repoFile('src/components/performance/AttributionTable.tsx');
    const differs = (kind: string, label: string) =>
      new RegExp(`${kind}:\\s*'${label}'`).test(src) && CHANNEL_KIND_AR[kind] !== label;
    expect(differs('TIKTOK', 'تيك توك')).toBe(true);
    expect(differs('TELEGRAM', 'تيليغرام')).toBe(true);
    expect(differs('SHEET', 'ملف')).toBe(true);
    expect(differs('WEBSITE', 'موقع')).toBe(true);
  });
});
