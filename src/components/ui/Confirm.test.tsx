// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ConfirmProvider, useAsk, useConfirm, useTell } from './Confirm';

/**
 * One dialog, three questions — and the rule that governs all three:
 * dismissing is declining. A dialog closed by Escape or Cancel must never
 * be read as a yes, and an ask closed half-typed must never hand back what
 * was half-typed.
 */

afterEach(() => cleanup());

type Api = { confirm: ReturnType<typeof useConfirm>; ask: ReturnType<typeof useAsk>; tell: ReturnType<typeof useTell> };

function mount(): Api {
  const api = {} as Api;
  function Grab() {
    api.confirm = useConfirm();
    api.ask = useAsk();
    api.tell = useTell();
    return null;
  }
  render(
    <ConfirmProvider>
      <Grab />
    </ConfirmProvider>
  );
  return api;
}

const button = (name: string) => screen.getByRole('button', { name });

describe('ask', () => {
  it('returns what was typed, trimmed', async () => {
    const api = mount();
    let answer: Promise<string | null>;
    act(() => {
      answer = api.ask({ title: 'سبب الرفض', input: { label: 'السبب', required: true } });
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  الطرد خرج  ' } });
    fireEvent.click(button('تابع'));
    await expect(answer!).resolves.toBe('الطرد خرج');
  });

  it('returns null on Cancel, never the half-typed text', async () => {
    const api = mount();
    let answer: Promise<string | null>;
    act(() => {
      answer = api.ask({ title: 'تأجيل', input: { label: 'السبب' } });
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'نصف جملة' } });
    fireEvent.click(button('إلغاء'));
    // The shipments screen used to read a cancelled prompt as "hold with no
    // reason" and go ahead. Null is the only answer a cancel may give.
    await expect(answer!).resolves.toBeNull();
  });

  it('keeps the button disabled until a required answer is given', () => {
    const api = mount();
    act(() => {
      void api.ask({ title: 'سبب الرفض', input: { label: 'السبب', required: true } });
    });
    expect((button('تابع') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect((button('تابع') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'سبب' } });
    expect((button('تابع') as HTMLButtonElement).disabled).toBe(false);
  });

  it('starts from the value it was given, for a rename', () => {
    const api = mount();
    act(() => {
      void api.ask({ title: 'إعادة تسمية', input: { label: 'الاسم', initial: 'بكسل المتجر' } });
    });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('بكسل المتجر');
  });

  it('marks a required field as required, in the label itself', () => {
    const api = mount();
    act(() => {
      void api.ask({ title: 'ر', input: { label: 'السبب', required: true } });
    });
    expect(screen.queryByText('*')).not.toBeNull();
  });
});

describe('confirm', () => {
  it('is still yes or no, and Cancel is no', async () => {
    const api = mount();
    let answer: Promise<boolean>;
    act(() => {
      answer = api.confirm({ title: 'حذف؟', tone: 'danger' });
    });
    fireEvent.click(button('إلغاء'));
    await expect(answer!).resolves.toBe(false);
  });

  it('colours a destructive confirmation and names it', () => {
    const api = mount();
    act(() => {
      void api.confirm({ title: 'حذف؟', tone: 'danger' });
    });
    expect(button('احذف').className).toContain('bg-[#fb323f]');
  });
});

describe('tell', () => {
  it('has one button and no Cancel — there is nothing to decline', async () => {
    const api = mount();
    let done: Promise<void>;
    act(() => {
      done = api.tell({ title: 'تعذر الحذف', body: 'السبب', tone: 'danger' });
    });
    expect(screen.queryByRole('button', { name: 'إلغاء' })).toBeNull();
    fireEvent.click(button('حسناً'));
    await expect(done!).resolves.toBeUndefined();
  });

  it('hands over a value to copy in a read-only field, with its own copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const api = mount();
    act(() => {
      void api.tell({ title: 'انسخ الرابط', value: 'https://shop.example/lp/x' });
    });
    const field = screen.getByDisplayValue('https://shop.example/lp/x');
    expect(field.hasAttribute('readonly')).toBe(true);

    await act(async () => {
      fireEvent.click(button('انسخ'));
    });
    expect(writeText).toHaveBeenCalledWith('https://shop.example/lp/x');
    expect(screen.queryByRole('button', { name: 'نُسخ' })).not.toBeNull();
  });
});

describe('without a provider', () => {
  it('still asks rather than going ahead', async () => {
    // A screen mounted outside the provider must never turn a question into
    // a yes. The browser's own dialog is the fallback, not silence.
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    let api = {} as Api;
    function Grab() {
      api = { confirm: useConfirm(), ask: useAsk(), tell: useTell() };
      return null;
    }
    render(<Grab />);
    await expect(api.ask({ title: 'س', input: { label: 'ل', required: true } })).resolves.toBeNull();
    expect(prompt).toHaveBeenCalled();
    prompt.mockRestore();
  });

  it('treats an empty required answer from the fallback as a refusal', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('   ');
    let api = {} as Api;
    function Grab() {
      api = { confirm: useConfirm(), ask: useAsk(), tell: useTell() };
      return null;
    }
    render(<Grab />);
    await expect(api.ask({ title: 'س', input: { label: 'ل', required: true } })).resolves.toBeNull();
    prompt.mockRestore();
  });
});
