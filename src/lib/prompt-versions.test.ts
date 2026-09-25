import { describe, expect, it } from 'vitest';
import { MAX_VERSIONS, recordVersions, type PromptHistory } from './ai-prompts';

/**
 * THE WORDING THAT WORKED, AFTER IT WAS REPLACED.
 *
 * A prompt is the one setting where a good edit and a ruinous one look
 * identical in the form — both are a box full of Arabic. What is kept is
 * the text being REPLACED, not the new one: the new one is in the settings
 * already, and what somebody needs the next morning is the sentence they
 * can no longer remember.
 */

const STAMP = { at: '2026-09-25T10:00:00.000Z', by: 'زكي' };
const later = (n: number) => ({ at: `2026-09-25T1${n}:00:00.000Z`, by: 'زكي' });

describe('what is kept', () => {
  it('the wording being replaced, not the one replacing it', () => {
    const h = recordVersions(undefined, { house: 'القديم' }, { house: 'الجديد' }, STAMP);
    expect(h.house).toEqual([{ text: 'القديم', at: STAMP.at, by: 'زكي' }]);
  });

  it('a first-ever override keeps an empty version — the default was in force', () => {
    // Restoring it clears the override, which is exactly what the editor's
    // "go back to normal" button does.
    const h = recordVersions(undefined, {}, { house: 'أول نص' }, STAMP);
    expect(h.house[0].text).toBe('');
  });

  it('clearing an override is itself a version worth keeping', () => {
    const h = recordVersions(undefined, { house: 'نص ضاع' }, {}, STAMP);
    expect(h.house[0].text).toBe('نص ضاع');
  });

  it('newest first — the one you want back is the one at the top', () => {
    let h: PromptHistory = recordVersions(undefined, { house: 'أ' }, { house: 'ب' }, STAMP);
    h = recordVersions(h, { house: 'ب' }, { house: 'ج' }, later(1));
    expect(h.house.map((v) => v.text)).toEqual(['ب', 'أ']);
  });

  it('who wrote over it, when the name is known', () => {
    const h = recordVersions(undefined, { house: 'أ' }, { house: 'ب' }, { at: STAMP.at, by: null });
    expect(h.house[0].by).toBeNull();
  });
});

describe('what is not kept', () => {
  it('a save that changed nothing — pressing save twice must not eat the history', () => {
    const first = recordVersions(undefined, { house: 'أ' }, { house: 'ب' }, STAMP);
    const again = recordVersions(first, { house: 'ب' }, { house: 'ب' }, later(1));
    expect(again.house).toHaveLength(1);
  });

  it('whitespace alone is not a change', () => {
    const h = recordVersions(undefined, { house: 'أ' }, { house: '  أ  ' }, STAMP);
    expect(h.house).toBeUndefined();
  });

  it('more than the cap — five is enough to undo a bad week', () => {
    let h: PromptHistory = {};
    for (let n = 0; n < 9; n++) {
      h = recordVersions(h, { house: `v${n}` }, { house: `v${n + 1}` }, later(n % 10));
    }
    expect(h.house).toHaveLength(MAX_VERSIONS);
    // And it is the OLDEST that falls off, never the newest.
    expect(h.house[0].text).toBe('v8');
  });

  it('a job this system no longer has — its versions could never be restored', () => {
    const h = recordVersions({ gone_job: [{ text: 'x', at: STAMP.at, by: null }] }, {}, {}, STAMP);
    expect(h.gone_job).toBeUndefined();
  });

  it('and the other jobs are left exactly as they were', () => {
    const h = recordVersions(
      { advisor: [{ text: 'قديم', at: STAMP.at, by: null }] },
      { house: 'أ' },
      { house: 'ب' },
      later(1)
    );
    expect(h.advisor).toHaveLength(1);
    expect(h.house).toHaveLength(1);
  });
});
