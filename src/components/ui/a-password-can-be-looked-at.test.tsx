// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import React from 'react';
import { Input } from './Input';

/**
 * A PASSWORD NOBODY CAN SEE IS A PASSWORD TYPED TWICE.
 *
 * The owner asked for the eye on the login box. The login box does not own
 * its field — it is drawn by `ui/Input`, and so are the two boxes on
 * register, the two on reset-password, the three on the profile, the one on
 * the new-user form and the courier's. Writing the button on the login page
 * would have answered the request and left eight fields behind, including
 * «تأكيد كلمة المرور», which is the one box in the product whose ONLY job
 * is to catch a typo in another box.
 *
 * WHY REVEALING IS SAFE HERE, STATED SO IT CAN BE CHECKED LATER. Every
 * secret field in this product is a field being TYPED INTO. Not one is
 * filled from the server: the screens that hold a saved token say in
 * writing «ولا تُعرَض بعدها أبداً» and show a four-character hint instead.
 * So the eye can only ever show what the person at the keyboard just put
 * there, on their own screen. The day a screen starts loading a stored
 * secret INTO one of these boxes, that sentence stops being true — and Ⅳ
 * below is what notices.
 *
 * THREE PASSWORD BOXES WERE DRAWN BY HAND, so raising the component would
 * not have raised them: the AI provider key, the ad-account token and the
 * conversions-API token. All three are now the shared field, which gave
 * them the eye and incidentally fixed an edge drawn at 1.25:1 where WCAG
 * asks 3:1 — the faint token was hidden behind a `const INPUT` string, so
 * `palette-contrast`, which reads the tag, could not see it.
 */

afterEach(cleanup);

const root = process.cwd();

describe('Ⅰ · the eye on a secret field', () => {
  it('starts hidden, and says what pressing it will do', () => {
    render(<Input label="كلمة المرور" type="password" name="pw" />);
    const box = screen.getByLabelText('كلمة المرور') as HTMLInputElement;
    expect(box.type).toBe('password');

    const eye = screen.getByRole('button', { name: 'إظهار كلمة المرور' });
    // One switch, not two buttons that swap glyphs. A reader says «مضغوط».
    expect(eye.getAttribute('aria-pressed')).toBe('false');
  });

  it('and pressing it turns the dots into letters, and back', async () => {
    const user = userEvent.setup();
    render(<Input label="كلمة المرور" type="password" name="pw" />);
    const box = screen.getByLabelText('كلمة المرور') as HTMLInputElement;

    await user.click(screen.getByRole('button', { name: 'إظهار كلمة المرور' }));
    expect(box.type, 'ضُغط الزرُّ ولم تَظهر الحروف').toBe('text');
    expect(screen.getByRole('button', { name: 'إخفاء كلمة المرور' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'إخفاء كلمة المرور' }));
    expect(box.type, 'لا طريقَ للعودةِ إلى الإخفاء').toBe('password');
  });

  it('and what was typed is still there after the switch', async () => {
    /*
     * Re-rendering with a different `type` must not remount the input.
     * React keeps the same DOM node here — but if a future version of this
     * component ever wrapped the two cases in different parents, the box
     * would come back EMPTY, and the eye would become a way to lose a
     * half-typed password. Typed rather than seeded, because that is the
     * state a person is actually in when they reach for the button.
     */
    const user = userEvent.setup();
    render(<Input label="كلمة المرور" type="password" name="pw" />);
    const box = screen.getByLabelText('كلمة المرور') as HTMLInputElement;

    await user.type(box, 'Sirr-9142');
    await user.click(screen.getByRole('button', { name: 'إظهار كلمة المرور' }));
    expect(box.value, 'ضاعَ المكتوبُ عند الإظهار').toBe('Sirr-9142');
    expect(box.type).toBe('text');
  });

  it('and the box is still focusable and typable while revealed', async () => {
    // The button sits ON TOP of the field's end. If it covered the box, or
    // stole focus, the eye would cost a keystroke to undo.
    const user = userEvent.setup();
    render(<Input label="كلمة المرور" type="password" name="pw" />);
    const box = screen.getByLabelText('كلمة المرور') as HTMLInputElement;

    await user.click(screen.getByRole('button', { name: 'إظهار كلمة المرور' }));
    await user.type(box, 'tail');
    expect(box.value, 'لا يمكنُ الكتابةُ بعد الإظهار').toBe('tail');
  });
});

describe('Ⅱ · and nowhere else', () => {
  it('no eye on an ordinary field', () => {
    render(<Input label="البريد الإلكتروني" type="email" name="email" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('nor on a field with no type at all', () => {
    render(<Input label="الاسم" name="name" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('and the field keeps its own type otherwise', () => {
    render(<Input label="البريد الإلكتروني" type="email" name="email" />);
    expect((screen.getByLabelText('البريد الإلكتروني') as HTMLInputElement).type).toBe('email');
  });
});

describe('Ⅲ · the side the eye sits on', () => {
  /**
   * NOT THE SAME SIDE ON EVERY FIELD. A password box inherits the page's
   * Arabic right-to-left; an API key box carries `dir="ltr"` because a key
   * is Latin. `inset-inline-end` and `padding-inline-end` resolve against
   * the element's OWN direction — so the wrapper must carry the same `dir`
   * the input does, or the button lands where the text begins.
   */
  it('the wrapper takes the direction the caller gave the field', () => {
    const { container } = render(<Input type="password" name="k" dir="ltr" />);
    const wrap = container.querySelector('div.relative');
    expect(wrap, 'لا غلافَ للزرِّ').not.toBeNull();
    expect(wrap!.getAttribute('dir'), 'الغلافُ لا يتبعُ اتجاهَ الحقل').toBe('ltr');
  });

  it('and the room made for it is logical, never physical', () => {
    const src = readFileSync(join(root, 'src/components/ui/Input.tsx'), 'utf8');
    /*
     * `px-3` and `pe-11` in one class list is a bet on which of the two the
     * stylesheet emits last — same specificity, different properties, and
     * the winner is whatever Tailwind happens to order second. A secret
     * field takes `ps-3 pe-11` and no `px-*`; an ordinary one keeps `px-3`.
     */
    expect(src).toMatch(/secret \? 'ps-3 pe-11 md:pe-10' : 'px-3'/);
    const base = /'h-11 md:h-10 w-full min-w-0 ([^']*)'/.exec(src);
    expect(base, 'تغيّر سطرُ الحقل').not.toBeNull();
    expect(base![1], 'حشوٌ فيزيائيٌّ عادَ إلى الأساس').not.toMatch(/\bp[xse]-/);
    // And the button is placed logically too.
    expect(src).toMatch(/absolute top-0 end-0/);
  });
});

describe('Ⅳ · and no password box in this product is drawn by hand', () => {
  /**
   * A WALK, NOT A LIST — because the three that were hand-drawn are exactly
   * what a list would have missed. This reads every `.tsx` under `src` and
   * fails on any `<input>` whose type is `password` outside the shared
   * field, so the next secret box cannot be written without the eye.
   *
   * `autoComplete="new-password"` also contains the word, so the test is
   * on the `type` attribute specifically and not on the tag's text.
   */
  const TAGS = /<input\b(?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*\/?>/g;
  const SECRET = /type=(?:"password"|'password'|\{[^}]*['"]password['"][^}]*\})/;

  function tsxFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx') && !p.includes('.test.')) {
          out.push(relative(root, p).split('\\').join('/'));
        }
      }
    };
    walk(join(root, 'src'));
    return out;
  }

  it('walks the whole tree, not a handful', () => {
    expect(tsxFiles().length).toBeGreaterThan(150);
  });

  it('and finds every password box inside ui/Input', () => {
    const offenders: string[] = [];
    for (const rel of tsxFiles()) {
      if (rel === 'src/components/ui/Input.tsx') continue;
      const src = readFileSync(join(root, rel), 'utf8');
      for (const m of src.matchAll(TAGS)) {
        if (SECRET.test(m[0])) {
          offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(
      offenders,
      `حقلُ كلمةِ مرورٍ مرسومٌ بيدٍ — بلا زرِّ إظهار (${offenders.length}):\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('and the shared field is the one that holds the rule', () => {
    // The sweep above passes trivially if `Input` stops drawing an input at
    // all, so the one file it excuses is required to have the thing.
    const src = readFileSync(join(root, 'src/components/ui/Input.tsx'), 'utf8');
    expect(src).toMatch(/type === 'password'/);
    expect(src).toMatch(/type=\{secret && revealed \? 'text' : type\}/);
  });
});
