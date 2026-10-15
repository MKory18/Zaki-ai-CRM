// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkinGallery, type SkinCard } from './SkinGallery';
import { STORE_TEMPLATES } from '@/lib/store-templates';
import { resolveSkinPalette } from '@/lib/store-skin';
import { STORE_FAMILIES, familyNoteAr, isGalleryVoice } from '@/lib/store-families';

/**
 * ── WHAT THIS SCREEN SHOWS SINCE THE FAMILIES LANDED (15/10) ──
 *
 * Not «the ten»: `AUDIT.md` §7.3 mapped them onto families and six are
 * kept as voices, three are MERGED into a kept one and one is RETIRED.
 * The four hidden ones still ship and still parse — a shop wearing one
 * keeps its look — so what this gallery offers is the VOICES, and the
 * assertions below read that list rather than counting to ten.
 */
const VOICES = STORE_TEMPLATES.filter((t) => isGalleryVoice(t.id));
const HIDDEN = STORE_TEMPLATES.filter((t) => !isGalleryVoice(t.id));

/**
 * THE GALLERY A SELLER ACTUALLY LOOKS AT.
 *
 * The ten shop templates were written, validated at module load and
 * shipped — and for the whole of this brief no screen could reach one. So
 * the thing worth testing is not that the data exists; it is that a seller
 * standing in front of this can see which template they are wearing,
 * narrow the list, compare the two widths, and install one.
 *
 * The cards are built from the REAL ten rather than from fixtures: a
 * gallery that passes on invented templates and breaks on the shipped ones
 * has tested its own test data.
 */

const cards: SkinCard[] = STORE_TEMPLATES.map((t) => ({
  key: t.id,
  label: t.name,
  suggestedFor: t.suggestedFor,
  feature: t.feature,
  mood: t.mood,
  corners: t.shape.corners,
  palette: resolveSkinPalette(t),
  layout: t.layout,
  home: t.home,
}));

// The repo's convention for a component test: vitest's environment is
// `node`, so nothing unmounts between cases on its own.
afterEach(cleanup);

const PRODUCTS = [
  { name: 'كريم مرطّب للوجه', image: '/api/public/media/a/b.webp', price: 14 },
  { name: 'سيروم فيتامين سي', image: null, price: 22 },
];

const draw = (over: Partial<Parameters<typeof SkinGallery>[0]> = {}) =>
  render(
    <SkinGallery
      skins={cards}
      installed={null}
      products={PRODUCTS}
      storeName="المبارك ستور"
      installing={null}
      onInstall={() => {}}
      {...over}
    />
  );

describe('the voices, in front of a seller', () => {
  it('shows every one a seller may choose, under its family', () => {
    draw();
    for (const t of VOICES) expect(screen.getByText(t.name), t.id).toBeTruthy();
    // And the family is on the screen without a press: its name and its
    // one line, which is the choice the owner actually makes.
    for (const f of STORE_FAMILIES) expect(screen.getByText(`عائلة «${f.name}»`), f.id).toBeTruthy();
  });

  it('and offers neither the merged nor the retired — without deleting them', () => {
    draw();
    // Hidden here…
    for (const t of HIDDEN) expect(screen.queryByText(t.name), t.id).toBeNull();
    // …and still shipped, still findable, so a shop wearing one keeps the
    // look it has. Deleting the name would make that shop's theme fail to
    // parse — a seller's storefront going blank over a list.
    expect(HIDDEN.length).toBeGreaterThan(0);
    for (const t of HIDDEN) expect(STORE_TEMPLATES.some((x) => x.id === t.id)).toBe(true);
  });

  it('and tells the seller, in Arabic, when their own shop wears one', () => {
    const merged = HIDDEN[0];
    draw({ installed: merged.id });
    // On screen because it is theirs, with the note that says what
    // happened and that their shop did not change.
    expect(screen.getByText(merged.name)).toBeTruthy();
    expect(screen.getByText(familyNoteAr(merged.id)!)).toBeTruthy();
  });

  it('says what each one puts forward, in words and not in a key', () => {
    draw();
    // `shopByNeed` is a key. A seller reads «تسوّق حسب الحاجة».
    expect(screen.getAllByText(/يبرز:/).length).toBe(VOICES.length);
    expect(screen.queryByText(/shopByNeed/)).toBeNull();
    expect(screen.queryByText(/bestSellersRank/)).toBeNull();
  });

  it('draws each preview with the seller’s own products', () => {
    draw();
    // Not invented names: the one question a gallery exists to answer is
    // «does MY shop look right in this», and only the seller's own
    // products can answer it.
    expect(screen.getAllByText('كريم مرطّب للوجه').length).toBeGreaterThan(0);
    // A product with no photograph stands on its letter, as the shop does.
    expect(screen.getAllByText('س').length).toBeGreaterThan(0);
  });

  it('and says so plainly when there are no products to draw with', () => {
    draw({ products: [] });
    expect(screen.getByText(/لا منتجات في هذا المتجر بعد/)).toBeTruthy();
  });
});

describe('the filter', () => {
  it('narrows the list to one suggested category', async () => {
    const user = userEvent.setup();
    draw();
    const category = VOICES[0].suggestedFor;
    const only = VOICES.filter((t) => t.suggestedFor === category);

    await user.click(screen.getByRole('button', { name: category }));

    for (const t of only) expect(screen.getByText(t.name), t.id).toBeTruthy();
    for (const t of VOICES.filter((t) => t.suggestedFor !== category)) {
      expect(screen.queryByText(t.name), t.id).toBeNull();
    }
  });

  it('and gives every one of them back', async () => {
    const user = userEvent.setup();
    draw();
    await user.click(screen.getByRole('button', { name: VOICES[0].suggestedFor }));
    await user.click(screen.getByRole('button', { name: 'الكل' }));
    expect(screen.getAllByRole('button', { name: /ثبّته كمسوّدة/ })).toHaveLength(VOICES.length);
  });

  it('is for browsing only — it refuses nothing and installs nothing', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    draw({ onInstall });
    await user.click(screen.getByRole('button', { name: VOICES[0].suggestedFor }));
    expect(onInstall).not.toHaveBeenCalled();
  });
});

describe('which one this shop is wearing', () => {
  it('is marked, and marked FIRST wherever it sits in the list', () => {
    /*
     * «القالب المثبّت معلّم بأعلى الشاشة», and the families made this
     * harder rather than easier: first WITHIN its family is not first on
     * a screen of four families. So it is lifted out above them under
     * «قالبك الحالي» — and the template chosen here is the LAST of the
     * list, so a card that merely keeps its place fails.
     */
    const last = STORE_TEMPLATES[STORE_TEMPLATES.length - 1];
    draw({ installed: last.id });
    expect(screen.getByText('قالبك الحالي')).toBeTruthy();

    const buttons = screen.getAllByRole('button', { name: /ثبّته كمسوّدة|أعد تثبيته/ });
    expect(buttons[0].textContent).toContain('أعد تثبيته');
    expect(screen.getByText('مثبّت')).toBeTruthy();
  });

  it('stays first under a filter that does not include it', async () => {
    const user = userEvent.setup();
    const mine = VOICES[0];
    const other = VOICES.find((t) => t.suggestedFor !== mine.suggestedFor)!;
    draw({ installed: mine.id });

    await user.click(screen.getByRole('button', { name: other.suggestedFor }));
    // A seller who filters still needs to know what they are wearing.
    expect(screen.getByText('مثبّت')).toBeTruthy();
    expect(screen.getByText(mine.name)).toBeTruthy();
  });

  it('marks nothing when the shop was painted by hand', () => {
    draw({ installed: null });
    expect(screen.queryByText('مثبّت')).toBeNull();
  });
});

describe('the two widths', () => {
  it('offers both, and starts on the phone', () => {
    draw();
    const group = screen.getByRole('group', { name: 'عرض المعاينة' });
    const phone = within(group).getByRole('button', { name: /جوال/ });
    const desk = within(group).getByRole('button', { name: /حاسوب/ });
    // A template is a promise about a phone before it is one about a
    // laptop, so that is the one a seller is shown first.
    expect(phone.getAttribute('aria-pressed')).toBe('true');
    expect(desk.getAttribute('aria-pressed')).toBe('false');
  });

  it('and switching draws a wider shelf, not the same one stretched', async () => {
    const user = userEvent.setup();
    const { container } = draw();
    const columns = () =>
      [...container.querySelectorAll<HTMLElement>('[style*="grid-template-columns"]')]
        .map((el) => (el.style.gridTemplateColumns.match(/repeat\((\d+)/) ?? [])[1])
        .filter(Boolean);

    const onPhone = columns();
    await user.click(within(screen.getByRole('group', { name: 'عرض المعاينة' })).getByRole('button', { name: /حاسوب/ }));
    const onDesktop = columns();

    expect(onPhone.length).toBe(VOICES.length);
    expect(new Set(onPhone)).toEqual(new Set(['2']));
    expect(new Set(onDesktop)).toEqual(new Set(['4']));
  });
});

describe('installing', () => {
  it('asks the caller, by the template’s own key', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    draw({ onInstall });
    // NOT the first card. A button wired to `skins[0]` instead of to its
    // own template passes every test that presses the first one — which is
    // how the first version of this test proved nothing.
    // NOT the first card, and one the gallery actually offers.
    const pick = VOICES[3];
    const card = screen.getByText(pick.name).closest('div.rounded-lg')!;
    await user.click(within(card as HTMLElement).getByRole('button', { name: /ثبّته كمسوّدة/ }));
    expect(onInstall).toHaveBeenCalledWith(pick.id);
  });

  it('and nothing else can be started while one is going in', () => {
    draw({ installing: STORE_TEMPLATES[0].id });
    for (const b of screen.getAllByRole('button', { name: /ثبّته كمسوّدة|أعد تثبيته/ })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
