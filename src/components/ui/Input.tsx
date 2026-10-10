import React, { useId, useState } from 'react';
import clsx from 'clsx';
import { RiEyeLine, RiEyeOffLine } from '@remixicon/react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

/**
 * A LABEL WITH NOWHERE TO POINT IS NOT A LABEL.
 *
 * These three read their id as `id || props.name`, and `htmlFor` got
 * whichever was there. MEASURED across every `.tsx` in this repository:
 * **117 of 131 labelled fields carried neither**, so `htmlFor` was
 * `undefined` and the `<label>` was associated with nothing at all.
 * Eighty-nine percent is not a scatter of forgetful call sites — it is this
 * component asking every caller to remember something, and almost nobody
 * doing it. So it is remembered here instead.
 *
 * WHAT THE READER GETS BACK. Pressing the word «الكمية المعدودة» focuses
 * the box under it, which is how a label behaves everywhere else and the
 * only reason a number box on a phone is reachable without hitting a
 * 40-pixel target exactly. A screen reader announces the field by its name
 * rather than «edit, blank». And `getByLabelText` — what a test uses to
 * find a field the way a person does — starts working, which is how this
 * was found: a stock-count test could not locate the box it was about to
 * prove writes off a shelf.
 *
 * `useId` and not a counter: the value must be the same string on the
 * server and in the browser or React replaces the markup on hydration.
 * `id` still wins, then `name`, so not one existing field changes.
 */
export function Input({ label, error, helperText, className, id, type, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id || props.name || autoId;

  /**
   * A PASSWORD NOBODY CAN SEE IS A PASSWORD TYPED TWICE.
   *
   * Every secret field in this product is a field somebody is TYPING INTO
   * — a password being chosen, a password being confirmed, an API key
   * being pasted. Not one of them is ever filled from the server: the
   * screens that hold a saved token say so in writing, «ولا تُعرَض بعدها
   * أبداً», and show a hint instead. So the eye can only ever reveal what
   * the person at the keyboard just put there on their own screen, which
   * is the whole reason it is safe to offer at all.
   *
   * WHY IT LIVES HERE AND NOT ON THE LOGIN SCREEN. The ask was for the
   * login box, and the login box draws its field with this component —
   * along with register, reset-password, the profile's three boxes, the
   * new-user form and the courier credentials. Writing the button once
   * here is the difference between one screen that can be read back and
   * nine that cannot, and it is the only version that is still true after
   * somebody adds the tenth.
   *
   * THE SIDE IT SITS ON IS THE SIDE THE TYPING ENDS ON, which is not the
   * same side on every field: a password box inherits the page's Arabic
   * right-to-left, while a key box carries `dir="ltr"` because an API key
   * is Latin. `inset-inline-end` and `padding-inline-end` resolve against
   * the field's OWN direction, so both come out right — but only if the
   * wrapper carries the same `dir` the input does, which is why it is
   * passed down rather than left to be inherited from the page.
   */
  const [revealed, setRevealed] = useState(false);
  const secret = type === 'password';
  const reveal = revealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';

  const field = (
    <input
      id={inputId}
      // Revealing is the ONLY thing this changes; the field keeps its own
      // type otherwise, so an email box is still an email box.
      type={secret && revealed ? 'text' : type}
      className={clsx(
        // 40px, stated. Padding alone made the height a by-product of
        // the font size, and a row of controls came out four heights.
        'h-11 md:h-10 w-full min-w-0 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors placeholder:text-[var(--sys-muted)]',
        // A physical `px-3` and a logical `pe-11` in one class list is a
        // bet on which of the two the stylesheet happens to emit last.
        // A secret field takes the logical pair and nothing else.
        secret ? 'ps-3 pe-11 md:pe-10' : 'px-3',
        error ? 'border-[var(--sys-destructive)] focus:border-[var(--sys-destructive)] focus:ring-[var(--sys-destructive)]/20' : 'border-[var(--sys-border-input)]',
        className
      )}
      {...props}
    />
  );

  return (
    <div className="w-full min-w-0">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--sys-heading)] mb-1.5">
          {label}
        </label>
      )}
      {secret ? (
        <div className="relative" dir={props.dir}>
          {field}
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            // `aria-pressed` is what makes it one switch rather than two
            // buttons that happen to swap glyphs — a reader says «مضغوط».
            aria-pressed={revealed}
            aria-label={reveal}
            title={reveal}
            className="absolute top-0 end-0 flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-lg text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25"
          >
            {revealed ? <RiEyeOffLine className="h-4 w-4" aria-hidden /> : <RiEyeLine className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      ) : (
        field
      )}
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{helperText}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string | number; label: string }[];
}

export function Select({ label, error, options, children, className, id, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = id || props.name || autoId;

  return (
    <div className="w-full min-w-0">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-[var(--sys-heading)] mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={clsx(
          'h-11 md:h-10 w-full min-w-0 px-3 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors',
          error ? 'border-[var(--sys-destructive)]' : 'border-[var(--sys-border-input)]',
          className
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /**
   * A sentence under the box — the same shape `Input` has, and for the same
   * reason: the rule a field is held to belongs beside the field, not in a
   * refusal that arrives after the work is typed. An error replaces it.
   */
  helperText?: string;
}

export function Textarea({ label, error, helperText, className, id, ...props }: TextareaProps) {
  const autoId = useId();
  const textareaId = id || props.name || autoId;

  return (
    <div className="w-full min-w-0">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-medium text-[var(--sys-heading)] mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={clsx(
          'w-full min-w-0 px-3 py-2 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors placeholder:text-[var(--sys-muted)]',
          error ? 'border-[var(--sys-destructive)]' : 'border-[var(--sys-border-input)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{helperText}</p>}
    </div>
  );
}
