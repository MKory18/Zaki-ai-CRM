// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StructureGallery } from './StructureGallery';
import { SlotFields } from './SlotFields';
import { LANDING_STRUCTURES, STRUCTURE_PROBLEM_SOLUTION } from '@/lib/landing-structures';

/**
 * THE EDITOR A SELLER ACTUALLY WRITES IN.
 *
 * Every structure already carried, for each slot, what it is FOR, what must
 * not be said, and an example — and all three lived in a data file nobody
 * opens. The thing worth testing is that they reach the person writing the
 * sentence, because a guide anywhere else is a guide nobody reads.
 */

afterEach(cleanup);

describe('choosing a structure', () => {
  const draw = (over: Partial<Parameters<typeof StructureGallery>[0]> = {}) =>
    render(
      <StructureGallery
        structures={LANDING_STRUCTURES}
        value={null}
        onChange={() => {}}
        productName="كريم مرطّب"
        {...over}
      />
    );

  it('shows all ten', () => {
    draw();
    for (const s of LANDING_STRUCTURES) expect(screen.getByText(s.name), s.id).toBeTruthy();
  });

  it('draws the STORY, as an order of beats', () => {
    draw();
    // What a seller is choosing between is the order: a page that opens on
    // the problem and one that opens on the price are two different pages.
    const card = screen.getByText('المشكلة ← الحل').closest('button')!;
    const beats = within(card).getAllByRole('listitem');
    expect(beats.length).toBe(
      STRUCTURE_PROBLEM_SOLUTION.sequence.filter((t) => t !== 'sticky' && t !== 'footer').length
    );
  });

  it('and puts the seller’s own product in the first beat', () => {
    draw();
    // «هل يناسب هذا منتجي؟» should be answerable by reading, not imagining.
    expect(screen.getAllByText('كريم مرطّب').length).toBe(LANDING_STRUCTURES.length);
  });

  it('carries no colour — the skin is the other half and chosen separately', () => {
    const { container } = draw();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe('the filters, which narrow and do nothing else', () => {
  const draw = (onChange = () => {}) =>
    render(<StructureGallery structures={LANDING_STRUCTURES} value={null} onChange={onChange} />);

  it('narrows by the ad that will point at the page', async () => {
    const user = userEvent.setup();
    draw();
    await user.click(screen.getByRole('button', { name: 'اكتشاف طريقة أبسط' }));
    expect(screen.getByText('الاكتشاف')).toBeTruthy();
    expect(screen.queryByText('العرض أولاً')).toBeNull();
  });

  it('and by how warm the visitor is', async () => {
    const user = userEvent.setup();
    draw();
    await user.click(screen.getByRole('button', { name: 'ساخن' }));
    // Only «العرض أولاً» is written for a hot visitor.
    expect(screen.getByText('العرض أولاً')).toBeTruthy();
    expect(screen.queryByText('القصة')).toBeNull();
  });

  it('says so plainly when the two filters cross at nothing', async () => {
    const user = userEvent.setup();
    draw();
    await user.click(screen.getByRole('button', { name: 'ساخن' }));
    await user.click(screen.getByRole('button', { name: 'قصة الأصل' }));
    expect(screen.getByText(/الفلتر للتصفّح فقط/)).toBeTruthy();
  });

  it('and filtering chooses nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    draw(onChange);
    // BOTH kinds of filter. The first version pressed only the
    // temperature one, so a framework chip wired to `onChange` went
    // unnoticed — and that is the chip a seller presses first.
    await user.click(screen.getByRole('button', { name: 'بارد' }));
    await user.click(screen.getByRole('button', { name: 'اكتشاف طريقة أبسط' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('while picking a card chooses that card', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    draw(onChange);
    await user.click(screen.getByText('كاسر الاعتراضات').closest('button')!);
    expect(onChange).toHaveBeenCalledWith('objections');
  });
});

describe('writing the copy', () => {
  const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];

  const draw = (over: Partial<Parameters<typeof SlotFields>[0]> = {}) =>
    render(
      <SlotFields
        structure={STRUCTURE_PROBLEM_SOLUTION}
        copy={{}}
        dialect="levantine"
        onChange={() => {}}
        {...over}
      />
    );

  it('every slot carries its purpose, its example and what is forbidden', () => {
    draw();
    for (const s of STRUCTURE_PROBLEM_SOLUTION.slots) {
      expect(screen.getByText(s.purpose), s.key).toBeTruthy();
      expect(screen.getByText(`ممنوع: ${s.avoid}`), s.key).toBeTruthy();
      expect(screen.getByText(`مثال: «${s.example}»`), s.key).toBeTruthy();
    }
  });

  it('counts characters, and counts them the way a person sees them', () => {
    // `.length` counts UTF-16 units, so a rare glyph would be counted twice
    // and the seller stopped early for a reason they could not see.
    draw({ copy: { [slot.key]: { levantine: 'ابتث🙂' } } });
    expect(screen.getByText(`5 / ${slot.max}`)).toBeTruthy();
  });

  it('says how far over the limit, and does not cut while typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const long = 'ا'.repeat(slot.max + 7);
    draw({ copy: { [slot.key]: { levantine: long } }, onChange });

    expect(screen.getByText(/أطول من حدّ الخانة بـ7 حرفاً/)).toBeTruthy();
    // A field that truncates as somebody types takes the end of their
    // sentence away mid-word.
    const field = screen.getByLabelText(slot.label) as HTMLTextAreaElement;
    expect([...field.value].length).toBe(slot.max + 7);

    await user.type(field, 'ب');
    expect(onChange).toHaveBeenCalled();
  });

  it('says so when another dialect’s words are what a visitor would read', () => {
    // A seller who did not notice would publish it believing they wrote it.
    draw({ copy: { [slot.key]: { msa: 'نصّ بالفصحى' } }, dialect: 'levantine' });
    expect(screen.getByText(/يظهر للزائر نصُّ لهجةٍ أخرى/)).toBeTruthy();
  });

  it('and shows them as the HINT, never as the field’s own value', async () => {
    // THE BUG THIS REPLACED: the fallback was the textarea's `value`, and
    // the note said «اكتب فوقه». You could not — clearing the field made
    // `copyIn` fall back again and put the formal line straight back, so
    // typing appended to a sentence the seller had not written.
    const user = userEvent.setup();
    const onChange = vi.fn();
    draw({ copy: { [slot.key]: { msa: 'نصّ بالفصحى' } }, dialect: 'levantine', onChange });

    const field = screen.getByLabelText(slot.label) as HTMLTextAreaElement;
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('نصّ بالفصحى');

    await user.type(field, 'ش');
    expect(onChange).toHaveBeenCalledWith(slot.key, 'levantine', 'ش');
  });

  it('counts only this dialect’s characters, not the hint’s', () => {
    draw({ copy: { [slot.key]: { msa: 'نصّ بالفصحى' } }, dialect: 'levantine' });
    expect(screen.getByText(`0 / ${slot.max}`)).toBeTruthy();
  });

  it('and says nothing when the dialect is the one written', () => {
    draw({ copy: { [slot.key]: { levantine: 'نصّ شامي' } }, dialect: 'levantine' });
    expect(screen.queryByText(/لهجةٍ أخرى/)).toBeNull();
    expect((screen.getByLabelText(slot.label) as HTMLTextAreaElement).placeholder).toBe('');
  });
});

describe('«اقتراح مساعد … للمراجعة لا للنشر المباشر»', () => {
  const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];
  const draw = (over: Partial<Parameters<typeof SlotFields>[0]> = {}) =>
    render(
      <SlotFields
        structure={STRUCTURE_PROBLEM_SOLUTION}
        copy={{}}
        dialect="levantine"
        onChange={() => {}}
        adHook="تعبان من وجع ضهرك؟"
        {...over}
      />
    );

  it('offers the ad’s hook for the headline, and only the headline', () => {
    draw();
    expect(screen.getAllByText(/اقترِح من خطّاف الإعلان/)).toHaveLength(1);
  });

  it('fills the field and nothing else — no save, no publish', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    draw({ onChange });
    await user.click(screen.getByText(/اقترِح من خطّاف الإعلان/));
    // The seller reads it, changes it, and owns it.
    expect(onChange).toHaveBeenCalledWith(slot.key, 'levantine', 'تعبان من وجع ضهرك؟');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not offer to overwrite something already written', () => {
    draw({ copy: { [slot.key]: { levantine: 'عنوان كتبه البائع' } } });
    expect(screen.queryByText(/اقترِح من خطّاف الإعلان/)).toBeNull();
  });

  it('and offers nothing when no ad is tied to the page', () => {
    draw({ adHook: null });
    expect(screen.queryByText(/اقترِح من خطّاف الإعلان/)).toBeNull();
  });

  it('never suggests more than the field may hold', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    draw({ adHook: 'ا'.repeat(200), onChange });
    await user.click(screen.getByText(/اقترِح من خطّاف الإعلان/));
    expect([...onChange.mock.calls[0][2]].length).toBe(slot.max);
  });
});
