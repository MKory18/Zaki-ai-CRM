// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * CREATING A PAGE: THE PRODUCT, THEN THE STORY, THEN THE LOOK, THEN THE WORDS.
 *
 * «إنشاء صفحة: اختيار المنتج ← اختيار البنية (معرض العشرة بمعاينة بمنتجك
 * الحقيقي) ← اختيار المظهر ← تعبئة خانات النص.»
 *
 * The three controls existed and none of them was reachable: the gallery,
 * the slot fields and their writing guide were components nobody rendered,
 * and the dialog offered the fifteen ready-made shapes alone. This file is
 * about the four steps being on the screen in that order and the words
 * leaving it in the request.
 *
 * THE PREVIEW RENDERER IS STUBBED ON PURPOSE. What the skin step claims is
 * not «a picture appears» — it is «نفس الترتيب ونفس النصّ، واللون والخطّ
 * فقط يتغيّران». A stub that records the props every card was given is the
 * only way to assert that, and asserting it against a drawn picture would
 * have been asserting the picture was non-empty.
 */

const { screenApi, preview, confirm } = vi.hoisted(() => ({
  screenApi: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/lib/screen-api', () => ({
  screenApi: (...a: unknown[]) => screenApi(...a),
  qs: (o: Record<string, unknown>) => new URLSearchParams(o as Record<string, string>).toString(),
  formatDate: () => '—',
}));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: { id: 'u1', role: 'OWNER' } }) }));
vi.mock('@/components/ui/Confirm', () => ({
  useTell: () => vi.fn(),
  useConfirm: () => confirm,
}));
vi.mock('@/lib/can', () => ({ userCan: () => false }));
vi.mock('@/components/landing/TemplatePreview', () => ({
  TemplatePreview: (props: Record<string, unknown>) => {
    preview(props);
    return <div data-testid="preview" />;
  },
}));

import { LandingPagesScreen } from './LandingPagesScreen';
import { STORE_TEMPLATES } from '@/lib/store-templates';
import { LANDING_STRUCTURES, STRUCTURE_PROBLEM_SOLUTION } from '@/lib/landing-structures';

const PRODUCT = { id: 'p1', name: 'حزام الظهر', sku: 'BELT-1', basePrice: 120, currency: 'SYP' };

/** One live page, so the row's own publish toggle can be pressed. */
const LIVE_PAGE = {
  id: 'lp1',
  name: 'صفحة قائمة',
  slug: 'listed',
  isPublished: true,
  showInStore: false,
  domain: null,
  domainVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  product: { name: PRODUCT.name },
};

/** The POST body the dialog sent, parsed. */
const sentBody = () => {
  const call = screenApi.mock.calls.find(
    (c) => c[0] === '/api/landing-pages' && (c[1] as RequestInit | undefined)?.method === 'POST'
  );
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
};

/**
 * THE DIALOG IS FOUR STEPS NOW — product → shape → words → name.
 *
 * The owner, 15/10 01:33: «the إنشاء صفحة هبوط dialog is cluttered — make
 * it steps». Every claim in this file is unchanged; what changed is that
 * reaching a control means walking to its step, so the walk is written
 * once here. Each helper leaves the dialog standing ON the step it names.
 */
type User = ReturnType<typeof userEvent.setup>;

const nextButton = () => screen.getByRole('button', { name: /^التالي$/ });
const createButton = () => screen.getByRole('button', { name: /^إنشاء$/ });

const openDialog = async (user: User) =>
  user.click(screen.getByRole('button', { name: /صفحة جديدة/ }));

/** Step 2 — the two starting points, the ten structures, the ten skins. */
const toShape = async (user: User) => {
  await openDialog(user);
  await user.click(nextButton());
};

/** Step 3 — the dialect row and the chosen structure's text slots. */
const toWords = async (user: User, structure: { name: string }) => {
  await toShape(user);
  await user.click(screen.getByText(structure.name));
  await user.click(nextButton());
};

/** Step 4 — the name and the address, and the «إنشاء» button. */
const toNaming = async (user: User) => {
  await user.click(nextButton());
  await user.type(screen.getByPlaceholderText('مثال: صفحة Tremella'), 'صفحة الحزام');
  await user.type(screen.getByPlaceholderText('tremella'), 'belt');
};

beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockResolvedValue(true);
  screenApi.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/landing-pages?')) return { landingPages: [LIVE_PAGE] };
    if (path === '/api/products') return { products: [PRODUCT] };
    if (path === '/api/landing-pages') return { landingPage: { id: 'new1' } };
    return {};
  });
});

afterEach(cleanup);

describe('the two starting points', () => {
  it('are both named without opening a menu', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);

    // A seller who cannot see that the ten structures exist goes on using
    // the fifteen forever, so neither is behind a click: they are side by
    // side on the shape step, not one of them under a dropdown.
    expect(screen.getByText('بنية إقناع × مظهر')).toBeTruthy();
    expect(screen.getByText('شكل جاهز')).toBeTruthy();
  });

  it('open on the structures, and the ten are listed', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);

    for (const s of LANDING_STRUCTURES) {
      expect(screen.getAllByText(s.name).length).toBeGreaterThan(0);
    }
  });

  it('and the ready-made shapes are still there, one labelled tab away', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);
    expect(screen.queryByText('شكل الصفحة')).toBeNull();

    await user.click(screen.getByText('شكل جاهز'));
    expect(screen.getByText('شكل الصفحة')).toBeTruthy();
  });

  it('and the product is asked for FIRST, because every preview after it sells it', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await openDialog(user);

    // Step one is the product and nothing else: asked afterwards, as it
    // was before the four steps, all fifteen previews advertise «منتجك».
    expect(screen.getByRole('button', { name: /اختر منتجًا/ })).toBeTruthy();
    expect(screen.queryByText('بنية إقناع × مظهر')).toBeNull();
    expect(screen.queryByPlaceholderText('مثال: صفحة Tremella')).toBeNull();
  });
});

describe('the story step', () => {
  it('draws the seller’s own product in the first beat once a product is chosen', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    const dialog = () => within(screen.getByRole('dialog'));

    // Nothing chosen yet: the first beat is the library's own word. Scoped
    // to the dialog — the list behind it names the product of every row.
    await toShape(user);
    expect(dialog().queryAllByText(PRODUCT.name)).toHaveLength(0);

    // Back one step, choose the product, forward again.
    await user.click(screen.getByRole('button', { name: /^السابق$/ }));
    await user.click(screen.getByRole('button', { name: /اختر منتجًا/ }));
    await user.click(await dialog().findByText(new RegExp(`^${PRODUCT.name}`)));
    await user.click(nextButton());

    // Once per structure card — the question «هل يناسب هذا منتجي؟» answered
    // by reading rather than by imagining.
    expect(dialog().getAllByText(PRODUCT.name).length).toBeGreaterThanOrEqual(LANDING_STRUCTURES.length);
  });

  it('will not let a page be created with no story chosen', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);

    /*
     * THE SAME REFUSAL, ONE STEP EARLIER.
     *
     * There is no default story, and a silent fallback would hand
     * somebody a first screen that contradicts the advert pointing at it.
     * On one long scroll that refusal could only be the «إنشاء» button at
     * the bottom; in four steps the shape step will not let you leave it
     * empty, which says the same thing sooner.
     */
    expect(nextButton()).toHaveProperty('disabled', true);

    await user.click(screen.getByText(STRUCTURE_PROBLEM_SOLUTION.name));
    expect(nextButton()).toHaveProperty('disabled', false);

    // And with a story, a name and an address, the last step lets go.
    await user.click(nextButton());
    await toNaming(user);
    expect(createButton()).toHaveProperty('disabled', false);
  });
});

describe('the skin step', () => {
  it('says what it is waiting for instead of previewing nothing', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);

    expect(screen.getByText(/يظهر بعد اختيار البنية/)).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
  });

  it('draws the chosen structure in every skin — one story, ten looks', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);
    await user.click(screen.getByText(STRUCTURE_PROBLEM_SOLUTION.name));

    expect(preview.mock.calls).toHaveLength(STORE_TEMPLATES.length);

    // PICK ONE FIRST. Measured before a skin is picked, a grid where the
    // CHOSEN card draws a different page would pass — nothing is chosen
    // yet, so the ten are trivially identical. That is the moment the
    // claim is about, and the first version of this test missed it.
    await user.click(screen.getByText(STORE_TEMPLATES[3].name));

    const drawn = preview.mock.calls.slice(-STORE_TEMPLATES.length).map((c) => c[0]);
    expect(drawn).toHaveLength(STORE_TEMPLATES.length);

    // THE CLAIM, ASSERTED: every card was handed the SAME sections object
    // and a DIFFERENT theme. A skin that changed a beat or a word fails the
    // first line; a grid that drew one look ten times, the second.
    expect(new Set(drawn.map((d) => d.sections)).size).toBe(1);
    expect(new Set(drawn.map((d) => d.theme.accent)).size).toBe(STORE_TEMPLATES.length);
  });
});

describe('the words step', () => {
  it('shows every slot of the chosen structure with its guide', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toWords(user, STRUCTURE_PROBLEM_SOLUTION);

    for (const slot of STRUCTURE_PROBLEM_SOLUTION.slots) {
      const field = screen.getByLabelText(new RegExp(slot.label));
      expect(field).toBeTruthy();
    }
    // The three halves of the guide, beside the field rather than in a file.
    expect(screen.getAllByText(/^ممنوع:/).length).toBe(STRUCTURE_PROBLEM_SOLUTION.slots.length);
  });

  it('puts what is typed into the preview as it is typed', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toWords(user, STRUCTURE_PROBLEM_SOLUTION);

    const hero = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;
    await user.type(screen.getByLabelText(new RegExp(hero.label)), 'وجع');

    const last = preview.mock.calls[preview.mock.calls.length - 1][0];
    expect(last.sections[hero.at][hero.field]).toBe('وجع');
  });
});

describe('what leaves the dialog', () => {
  it('sends the structure, the skin, the dialect and the words — and no shape', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);
    await user.click(screen.getByText(STRUCTURE_PROBLEM_SOLUTION.name));
    await user.click(screen.getByText(STORE_TEMPLATES[0].name));
    await user.click(nextButton());

    const hero = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;
    await user.type(screen.getByLabelText(new RegExp(hero.label)), 'وجع');
    await toNaming(user);
    await user.click(createButton());

    const body = sentBody();
    expect(body.structure).toBe(STRUCTURE_PROBLEM_SOLUTION.id);
    expect(body.skin).toBe(STORE_TEMPLATES[0].id);
    expect(body.dialect).toBe('msa');
    expect(body.copy.heroTitle.msa).toBe('وجع');
    // The route refuses copy that arrives beside a shape, for the right
    // reason — so the dialog never sends both halves.
    expect(body.template).toBeUndefined();
  });

  it('sends the shape alone from the other tab, with no copy to refuse', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toShape(user);
    await user.click(screen.getByText('شكل جاهز'));
    await user.click(nextButton());
    await toNaming(user);
    await user.click(createButton());

    const body = sentBody();
    expect(body.template).toBe('classic');
    expect(body.copy).toBeUndefined();
    expect(body.structure).toBeUndefined();
  });

  it('keeps every slot, not only the last one typed', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toWords(user, STRUCTURE_PROBLEM_SOLUTION);

    const [first, second] = STRUCTURE_PROBLEM_SOLUTION.slots;
    await user.type(screen.getByLabelText(new RegExp(first.label)), 'أوّل');
    await user.type(screen.getByLabelText(new RegExp(second.label)), 'ثانٍ');
    await toNaming(user);
    await user.click(createButton());

    const body = sentBody();
    expect(body.copy[first.key].msa).toBe('أوّل');
    expect(body.copy[second.key].msa).toBe('ثانٍ');
  });

  it('keeps both dialects of one slot, so a second pass is not a replacement', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toWords(user, STRUCTURE_PROBLEM_SOLUTION);

    const hero = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;
    await user.type(screen.getByLabelText(new RegExp(hero.label)), 'بالفصحى');
    await user.click(screen.getByRole('button', { name: 'شامية' }));
    // The field shows the formal line as a fallback, with a note saying so;
    // writing over it must not take the formal one away.
    await user.clear(screen.getByLabelText(new RegExp(hero.label)));
    await user.type(screen.getByLabelText(new RegExp(hero.label)), 'بالشامي');
    await toNaming(user);
    await user.click(createButton());

    const body = sentBody();
    expect(body.copy.heroTitle.msa).toBe('بالفصحى');
    expect(body.copy.heroTitle.levantine).toBe('بالشامي');
  });

  it('carries the dialect the seller switched to', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toWords(user, STRUCTURE_PROBLEM_SOLUTION);
    await user.click(screen.getByRole('button', { name: 'شامية' }));

    const hero = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;
    await user.type(screen.getByLabelText(new RegExp(hero.label)), 'وجع');
    await toNaming(user);
    await user.click(createButton());

    const body = sentBody();
    expect(body.dialect).toBe('levantine');
    expect(body.copy.heroTitle.levantine).toBe('وجع');
  });
});

describe('taking a page down from the list', () => {
  /**
   * The quieter of the two publish toggles, and the likelier to be pressed
   * by accident: it sits between «أظهِرها في المتجر» and «نسخ الرابط» on a
   * list, where the hand is scanning rather than deciding.
   */
  const patched = () =>
    screenApi.mock.calls.filter(
      (c) => c[0] === `/api/landing-pages/${LIVE_PAGE.id}` && (c[1] as RequestInit)?.method === 'PATCH'
    );

  it('asks, and names the paid clicks that would hit a closed page', async () => {
    const user = userEvent.setup();
    confirm.mockResolvedValue(false);
    render(<LandingPagesScreen />);

    await user.click((await screen.findAllByTitle('إلغاء النشر'))[0]);

    expect(confirm).toHaveBeenCalledTimes(1);
    const asked = confirm.mock.calls[0][0];
    expect(asked.body).toMatch(/مدفوعة/);
    expect(asked.tone).toBe('danger');
  });

  it('and leaves the page exactly as it was when the answer is no', async () => {
    const user = userEvent.setup();
    confirm.mockResolvedValue(false);
    render(<LandingPagesScreen />);

    await user.click((await screen.findAllByTitle('إلغاء النشر'))[0]);
    expect(patched()).toHaveLength(0);
  });

  it('takes it down when the answer is yes', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);

    await user.click((await screen.findAllByTitle('إلغاء النشر'))[0]);
    expect(patched()).toHaveLength(1);
    expect(JSON.parse((patched()[0][1] as RequestInit).body as string)).toEqual({ isPublished: false });
  });

  it('and «أظهِرها في المتجر» is a different act, so it does not ask this question', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);

    await user.click((await screen.findAllByLabelText('أظهِرها في المتجر'))[0]);
    // Being listed in the shop window is not being on the internet: the
    // page is reachable by its link either way, so there are no paid clicks
    // to lose and nothing for a dialog to warn about.
    expect(confirm).not.toHaveBeenCalled();
    expect(patched()).toHaveLength(1);
  });
});

describe('the dialog forgets the last page', () => {
  it('reopens with nothing chosen', async () => {
    const user = userEvent.setup();
    render(<LandingPagesScreen />);
    await toWords(user, STRUCTURE_PROBLEM_SOLUTION);

    const hero = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;
    await user.type(screen.getByLabelText(new RegExp(hero.label)), 'وجع');
    await user.click(screen.getByRole('button', { name: /^إلغاء$/ }));

    // AND IT REOPENS ON STEP ONE, not on the step it was abandoned on.
    await openDialog(user);
    expect(screen.getByRole('button', { name: /اختر منتجًا/ })).toBeTruthy();
    await user.click(nextButton());
    // Not «the previous page's words in a new page's fields».
    expect(screen.getByText(/يظهر بعد اختيار البنية/)).toBeTruthy();

    // AND THE SAME STORY RE-CHOSEN, which is the only way to see the
    // fields again. Without this the assertion below passed whatever the
    // copy held: no structure is chosen on reopen, so no field is drawn
    // and `queryByDisplayValue` was asking about markup that did not
    // exist. A forgotten `setCopy({})` went unnoticed exactly there.
    await user.click(screen.getByText(STRUCTURE_PROBLEM_SOLUTION.name));
    await user.click(nextButton());
    expect((screen.getByLabelText(new RegExp(hero.label)) as HTMLTextAreaElement).value).toBe('');
    expect(within(screen.getByRole('dialog')).queryByDisplayValue('وجع')).toBeNull();
  });
});
