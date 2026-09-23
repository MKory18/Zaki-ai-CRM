'use client';

import { useEffect } from 'react';

/**
 * TYPING ON THE PAGE ITSELF.
 *
 * The side panel asks "what is the headline?" next to a preview of the
 * headline. Answering it in the preview is one step instead of three, and
 * it is how everybody expects a visual editor to work.
 *
 * Done by marking the texts the seller writes with `data-edit="<field>"`
 * in the block components — one attribute each — and making exactly those
 * editable here. Nothing else on the page becomes editable, so a price
 * read from the catalogue or a region list stays untouchable: those are
 * not the seller's words to type over.
 *
 * The public page never runs this. The attributes are inert there.
 *
 * Committing on BLUR, not on every keystroke: a page that re-renders under
 * the cursor after each letter loses the caret, and the caret jumping to
 * the start on the second letter is the classic way this feature is
 * written badly.
 */
export function useInlineEdit(
  root: HTMLElement | null,
  activeId: string | null,
  commit: (id: string, field: string, value: string) => void
) {
  useEffect(() => {
    if (!root || !activeId) return;

    // Only inside the block being edited: making the whole page editable
    // means a stray click puts a caret in somebody else's heading.
    const holder = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(activeId)}"]`);
    if (!holder) return;

    const nodes = [...holder.querySelectorAll<HTMLElement>('[data-edit]')];
    if (nodes.length === 0) return;

    const cleanups: (() => void)[] = [];

    for (const node of nodes) {
      const field = node.dataset.edit!;
      node.contentEditable = 'plaintext-only';
      node.spellcheck = false;
      node.style.outline = 'none';
      node.style.cursor = 'text';
      node.title = 'اكتب هنا';

      const before = node.textContent ?? '';

      const onBlur = () => {
        const now = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (now !== before.trim()) commit(activeId, field, now);
      };
      // Enter commits rather than inserting a line into a headline; Escape
      // puts back what was there, which is what Escape means everywhere.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          node.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          node.textContent = before;
          node.blur();
        }
        // A keystroke inside the text is not a shortcut for the page.
        e.stopPropagation();
      };
      // Clicking the words must not also re-select the block underneath.
      const onDown = (e: MouseEvent) => e.stopPropagation();

      node.addEventListener('blur', onBlur);
      node.addEventListener('keydown', onKey);
      node.addEventListener('mousedown', onDown);
      cleanups.push(() => {
        node.removeEventListener('blur', onBlur);
        node.removeEventListener('keydown', onKey);
        node.removeEventListener('mousedown', onDown);
        node.removeAttribute('contenteditable');
        node.style.cursor = '';
        node.removeAttribute('title');
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [root, activeId, commit]);
}
