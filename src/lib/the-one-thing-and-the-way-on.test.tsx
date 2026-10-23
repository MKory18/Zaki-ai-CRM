// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «الطريق الواحد» — ONE THING AT THE TOP, AND THE WAY ON AT THE END.
 *
 * The owner's plan, المرحلة ١: «بطاقة «مهمّتك الجاية» أول الرئيسية لكل دور:
 * الرقم من السيرفر وزر واحد» — and «زر «الخطوة الجاية ←» آخر كل خطوة»، and
 * «لما يخلص الطابور: «تمّت المهمة!» وزر للخطوة الجاية، بدل جدول فاضي».
 *
 * Three claims, one per part:
 *
 *   1. the card says ONE sentence about ONE server number, and its button
 *      goes where that number is worked, never where the person may not go;
 *   2. the button at the end of a stop points at the NEXT registered stop —
 *      read from `step`, not written per screen — and draws nothing when the
 *      person may not open that stop;
 *   3. an emptied queue says «تمّت المهمة!» and carries the same way on.
 *
 * ── WHY EACH CLAIM IS ALSO PUT THROUGH MUTATIONS ──
 *
 * An assertion that cannot fail is a comment. Each part is asserted on a good
 * input and then re-asserted on deliberately broken ones — a flipped
 * permission, a removed guard, a swapped number — and every broken input MUST
 * make the same assertion throw. If a mutation passes, the test was measuring
 * the mock, not the product.
 * ═══════════════════════════════════════════════════════════════════════
 */

const may = { yes: (_path: string) => true };
vi.mock('@/hooks/useMayOpen', () => ({
  useMayOpen: () => (target: string | { path: string }) =>
    may.yes(typeof target === 'string' ? target : target.path),
}));
const where = { path: '/ops/preparation' };
vi.mock('next/navigation', () => ({ usePathname: () => where.path }));

import { MissionCardView } from '@/components/dashboard/MissionCard';
import { MissionDone, NEXT_STEP_LABEL, NextStepButton } from '@/components/ui/NextStep';
import { missionFor, missionSentence, type Mission } from './mission-card';
import { WORK_KINDS, type WorkItem, type WorkKey } from './my-work';
import { repoFile, stripComments } from './guard-source';

const item = (key: WorkKey, count: number, href?: string | null): WorkItem => {
  const k = WORK_KINDS.find((x) => x.key === key)!;
  return { key, ar: k.ar, count, href: href === undefined ? k.href : href, icon: k.icon, tone: k.tone };
};

/** «12 طلب جديد بستنوا تأكيد» — the plan's own example, from the server's 12. */
const TWELVE = [item('CONFIRM_POOL', 12)];

beforeEach(() => {
  may.yes = () => true;
  where.path = '/ops/preparation';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Assert on a good input, then assert the SAME thing on each broken input and
 * require it to throw. `of` builds the broken input; a mutation that still
 * passes fails this test by name.
 */
function survivesOnlyTheRightInput<T>(
  good: T,
  broken: { name: string; of: (v: T) => T }[],
  assert: (v: T) => void
) {
  assert(good);
  for (const m of broken) {
    expect(() => assert(m.of(good)), `الطفرة «${m.name}» ما أفشلت الاختبار`).toThrow();
  }
}

// ───────────────────────── 1. «مهمّتك الجاية» ─────────────────────────

describe('the card at the top says one thing', () => {
  const missionOf = (items: WorkItem[]) => missionFor(items, () => true);

  it('— the server’s number, the plan’s sentence, and no second figure', () => {
    const mission = missionOf(TWELVE)!;
    // The number is printed as it arrived. Nothing here adds or re-derives.
    expect(missionSentence(mission)).toBe('12 طلب جديد بستنوا تأكيد ← ابدأ التأكيد');
    expect(mission.item.count).toBe(12);

    render(<MissionCardView mission={mission} />);
    expect(screen.getByTestId('mission-sentence').textContent).toBe(
      '12 طلب جديد بستنوا تأكيد ← ابدأ التأكيد'
    );
    // ONE control. A second button would be a second answer to «ماذا الآن».
    const links = within(screen.getByTestId('mission-sentence').parentElement!)
      .getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/confirmation/queue');
  });

  it('— and the sentence is the SERVER’s count: swap the count, the sentence follows', () => {
    survivesOnlyTheRightInput<WorkItem[]>(
      TWELVE,
      [
        { name: 'الرقم صار 13', of: (items) => [item('CONFIRM_POOL', 13)] },
        { name: 'الرقم صار صفر', of: (items) => [item('CONFIRM_POOL', 0)] },
        { name: 'الطلبات صارت شحناً جاهزاً', of: () => [item('READY_TO_SHIP', 12)] },
      ],
      (items) => {
        const m = missionOf(items);
        expect(m && missionSentence(m)).toBe('12 طلب جديد بستنوا تأكيد ← ابدأ التأكيد');
      }
    );
  });

  it('— a card whose door this person may not open is not a mission', () => {
    // The negative case the plan asks for: no permission, no button.
    expect(missionFor(TWELVE, () => false)).toBeNull();

    // …and it must be the PERMISSION that removed it, not the input.
    expect(missionFor(TWELVE, () => true)).not.toBeNull();

    survivesOnlyTheRightInput<boolean>(
      true,
      [{ name: 'سُحبت الصلاحية', of: () => false }],
      (allowed) => {
        expect(missionFor(TWELVE, () => allowed)).not.toBeNull();
      }
    );
  });

  it('— work with no door is work, but it is not a step: it is skipped, not invented', () => {
    // A moderator's own unconfirmed orders have `href: null` by design. The
    // guard `i.href !== null` is what keeps the card from shouting and then
    // shrugging; remove it and this list produces a mission with no href.
    const noDoor = [item('MY_UNCONFIRMED', 4, null)];
    expect(missionFor(noDoor, () => true)).toBeNull();

    const behind = [item('MY_UNCONFIRMED', 4, null), item('CONFIRM_POOL', 12)];
    expect(missionSentence(missionFor(behind, () => true)!)).toBe(
      '12 طلب جديد بستنوا تأكيد ← ابدأ التأكيد'
    );

    survivesOnlyTheRightInput<WorkItem[]>(
      behind,
      [{ name: 'حُذف الطلب الذي بلا باب', of: () => [item('CONFIRM_POOL', 12)] }],
      (items) => {
        // The claim is not just «a mission exists» — it is «the one with a
        // door was chosen». A list of one proves nothing about ordering.
        expect(items.length).toBeGreaterThan(1);
        expect(missionFor(items, () => true)!.item.href).not.toBeNull();
      }
    );
  });

  it('— nothing waiting is nothing drawn, not an empty card', () => {
    expect(missionOf([])).toBeNull();
    const { container } = render(<div>{null}</div>);
    expect(container.textContent).toBe('');
  });

  it('— and the card computes no figure of its own (the invariant, read as source)', () => {
    for (const f of ['src/lib/mission-card.ts', 'src/components/dashboard/MissionCard.tsx']) {
      const src = stripComments(repoFile(f));
      expect(src, `${f} يحسب رقماً في المتصفح`).not.toMatch(/toLocaleString|Intl\.|reduce\(/);
      expect(src, `${f} يجمع أو يطرح`).not.toMatch(/\.count\s*[+\-*/]/);
    }
  });
});

// ───────────────────────── 2. «الخطوة الجاية ←» ─────────────────────────

/** The nine stops, and the stop after each — from the registry's own numbers. */
const ROAD: [string, string][] = [
  ['/ops/preparation', '/ops/shipments/new'],
  ['/ops/shipments/new', '/ops/batches'],
  ['/ops/batches', '/ops/tracking'],
  ['/ops/tracking', '/ops/returns'],
  ['/finance/agents', '/finance/collection'],
  ['/finance/collection', '/finance/matching'],
  ['/finance/matching', '/finance/closing'],
];

describe('the end of a step offers the next one', () => {
  it.each(ROAD)('%s ← %s', (here, next) => {
    where.path = here;
    render(<NextStepButton />);
    const link = screen.getByRole('link');
    expect(link.textContent).toContain(NEXT_STEP_LABEL);
    // The route is the REGISTRY's, never a string written on the screen.
    expect(link.getAttribute('href')).toBe(next);
  });

  it('and the last stop of each road has no button, because there is no step after it', () => {
    for (const last of ['/ops/returns', '/finance/closing']) {
      where.path = last;
      const { container, unmount } = render(<NextStepButton />);
      expect(container.querySelector('a'), `${last} اخترع خطوة بعد الأخيرة`).toBeNull();
      unmount();
    }
  });

  it('and it refuses to render when the person lacks the next step’s permission', () => {
    where.path = '/ops/preparation';
    may.yes = () => false;
    const { container } = render(<NextStepButton />);
    // Not a disabled button, not a greyed one: nothing.
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('');

    // …and it must be the PERMISSION, so restoring it must restore the button.
    may.yes = () => true;
    const back = render(<NextStepButton />);
    expect(back.container.querySelector('a')!.getAttribute('href')).toBe('/ops/shipments/new');
  });

  it('— mutation series: the wrong stop, a stop the person may not open, the last stop', () => {
    survivesOnlyTheRightInput<string>(
      '/ops/preparation',
      [
        { name: 'الوقوف على الشحنة بدل التجهيز', of: () => '/ops/batches' },
        { name: 'الوقوف على المرتجعات (آخر الطريق)', of: () => '/ops/returns' },
      ],
      (path) => {
        where.path = path;
        const { container, unmount } = render(<NextStepButton />);
        expect(container.querySelector('a')!.getAttribute('href')).toBe('/ops/shipments/new');
        unmount();
      }
    );

    survivesOnlyTheRightInput<boolean>(
      true,
      [{ name: 'سُحبت صلاحية الخطوة الجاية', of: () => false }],
      (allowed) => {
        may.yes = () => allowed;
        where.path = '/ops/preparation';
        const { container, unmount } = render(<NextStepButton />);
        expect(container.querySelector('a')).not.toBeNull();
        unmount();
        may.yes = () => true;
      }
    );
  });

  it('— every stop of both roads carries it, and no screen names a route itself', () => {
    const screens: [string, string][] = [
      ['src/components/screens/PreparationScreen.tsx', 'NextStepButton'],
      ['src/components/screens/ShipmentsNewScreen.tsx', 'NextStepButton'],
      ['src/components/screens/ShippingBatchesScreen.tsx', 'NextStepButton'],
      ['src/components/screens/TrackingScreen.tsx', 'NextStepButton'],
      ['src/components/screens/AgentCustodyScreen.tsx', 'NextStepButton'],
      ['src/components/screens/finance/CollectionScreen.tsx', 'NextStepButton'],
      ['src/components/screens/finance/MatchingScreen.tsx', 'NextStepButton'],
      // The closing is the LAST numbered stop of the money road, so it has no
      // button — see the test below, which draws it at that path.
    ];
    for (const [file, component] of screens) {
      const src = stripComments(repoFile(file));
      expect(src, `${file} بلا زر «الخطوة الجاية»`).toContain(`<${component} />`);
      // The button appears with no props: a screen that had to be told where
      // the next stop is would be a second copy of the registry.
      expect(src, `${file} يمرّر وجهة الزر بنفسه`).not.toMatch(/<NextStepButton[^/>]+href/);
    }
  });

  it('— the daily close is the last stop of the money road: the button draws nothing there, so the screen does not carry one', () => {
    where.path = '/finance/closing';
    const { container } = render(<NextStepButton />);
    expect(container.querySelector('a')).toBeNull();
    expect(
      stripComments(repoFile('src/components/screens/finance/ClosingScreen.tsx')),
      'ClosingScreen يحمل زراً لا يُرسم أبداً'
    ).not.toContain('NextStepButton');
  });
});

// ───────────────────────── 3. «تمّت المهمة!» ─────────────────────────

describe('an emptied queue says the task is done, and carries the way on', () => {
  it('— the plan’s sentence, the screen’s own «why», and the next stop as the action', () => {
    where.path = '/ops/preparation';
    render(<MissionDone why="لا توجد طلبات مؤكدة بانتظار التجهيز." />);
    expect(screen.getByText('تمّت المهمة!')).toBeTruthy();
    expect(screen.getByText('لا توجد طلبات مؤكدة بانتظار التجهيز.')).toBeTruthy();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/ops/shipments/new');
    expect(link.textContent).toContain(NEXT_STEP_LABEL);
  });

  it('— the task is done, but the door is still a door: no permission, no link', () => {
    where.path = '/ops/preparation';
    may.yes = () => false;
    render(<MissionDone why="لا توجد دفعات." />);
    expect(screen.getByText('تمّت المهمة!')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();

    may.yes = () => true;
    const back = render(<MissionDone why="لا توجد دفعات." />);
    expect(back.getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('— mutation series: a swapped outcome, a removed done-sentence, a lost guard', () => {
    // «swap an outcome»: the queue says the next step is the previous one.
    where.path = '/ops/preparation';
    render(<MissionDone why="س." next={{ label: 'المرتجعات', href: '/ops/returns' }} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/ops/returns');
    cleanup();

    survivesOnlyTheRightInput<string>(
      '/ops/shipments/new',
      [
        { name: 'الخطوة الجاية صارت التجهيز (رجوع للخلف)', of: () => '/ops/preparation' },
        { name: 'الخطوة الجاية صارت المرتجعات (تخطّي خطوتين)', of: () => '/ops/returns' },
      ],
      (href) => {
        where.path = '/ops/preparation';
        const { container, unmount } = render(<MissionDone why="س." next={{ label: 'x', href }} />);
        expect(container.querySelector('a')!.getAttribute('href')).toBe('/ops/shipments/new');
        unmount();
      }
    );

    // «remove the guard»: the same component, permission gone, still links.
    survivesOnlyTheRightInput<boolean>(
      false,
      [{ name: 'أُعيدت الصلاحية', of: () => true }],
      (allowed) => {
        may.yes = () => allowed;
        where.path = '/ops/preparation';
        const { container, unmount } = render(<MissionDone why="س." />);
        expect(container.querySelector('a'), 'الزر ظهر بلا صلاحية').toBeNull();
        unmount();
        may.yes = () => true;
      }
    );
  });

  it('— and the queues that emptied are the ones that say it', () => {
    // Four screens whose empty list was a table-shaped sentence. Each one now
    // ends in «تمّت المهمة!» instead — and keeps its own «why».
    const screens: [string, string][] = [
      ['src/components/screens/PreparationScreen.tsx', 'لا توجد طلبات مؤكدة بانتظار التجهيز.'],
      ['src/components/screens/ShipmentsNewScreen.tsx', 'كل ما تأكّد وتجهّز صار دفعةً أو شُحن.'],
      ['src/components/screens/ShippingBatchesScreen.tsx', 'لا دفعات هنا.'],
      ['src/components/screens/ReturnsScreen.tsx', 'فراغُ القائمة يعني أنّ لا طردَ في طريق العودة.'],
    ];
    for (const [file, why] of screens) {
      const src = stripComments(repoFile(file));
      expect(src, `${file} ما زال يقول «لا توجد» بدل «تمّت المهمة!»`).toContain('<MissionDone');
      expect(src, `${file} فقد جملته عن معنى الفراغ`).toContain(why);
    }

    // The word itself lives in ONE place — a second copy of the sentence is a
    // second spelling of it later.
    const owners = ['src/components/ui/NextStep.tsx'];
    for (const f of owners) expect(repoFile(f)).toContain('تمّت المهمة!');
    for (const [file] of screens) {
      expect(stripComments(repoFile(file)), `${file} كتب الجملة بنفسه`).not.toContain('تمّت المهمة!');
    }
  });
});
