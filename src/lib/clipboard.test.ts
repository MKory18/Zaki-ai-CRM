// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

/**
 * Copying on a machine where copying is not allowed.
 *
 * `navigator.clipboard` exists only over HTTPS or localhost — not on the
 * office server this will sit on without a certificate. Six buttons called
 * it inside an empty catch, so on such a machine they pressed and did
 * nothing, with no message. That is worse than an error: the person decides
 * the feature is broken and stops using it.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('copying text', () => {
  it('uses the real clipboard when the browser allows it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back when the clipboard API is missing entirely', async () => {
    // Plain HTTP: the property simply is not there.
    vi.stubGlobal('navigator', {});
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText('hello')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('falls back when the clipboard API refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText('hello')).toBe(true);
  });

  it('says false rather than pretending, when both fail', async () => {
    // The caller can then show the text for manual copying.
    vi.stubGlobal('navigator', {});
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('hello')).toBe(false);
  });

  it('leaves no stray element behind on the page', async () => {
    vi.stubGlobal('navigator', {});
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(true);
    const before = document.body.childElementCount;
    await copyText('hello');
    expect(document.body.childElementCount).toBe(before);
  });
});
