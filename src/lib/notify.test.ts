import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Telling people after the response — and, outside a request, now.
 */

const { createNotification, after } = vi.hoisted(() => ({ createNotification: vi.fn(), after: vi.fn() }));

vi.mock('./notification', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('next/server', () => ({ after: (...a: unknown[]) => after(...a) }));

import { afterResponse, notify } from './notify';

const opts = { companyId: 'c1', storeId: 's1', audience: { permission: 'confirmation.supervise' }, title: 't', message: 'm' };

beforeEach(() => {
  vi.clearAllMocks();
  createNotification.mockResolvedValue(1);
});

describe('inside a request', () => {
  it('hands the work to after(), so the response does not wait for it', () => {
    after.mockImplementation(() => undefined); // accepted, runs later
    notify(opts);
    expect(after).toHaveBeenCalledTimes(1);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('runs it when after() runs it', async () => {
    let scheduled: (() => Promise<unknown>) | undefined;
    after.mockImplementation((fn: () => Promise<unknown>) => {
      scheduled = fn;
    });
    notify(opts);
    await scheduled!();
    expect(createNotification).toHaveBeenCalledWith(opts);
  });
});

describe('outside a request — the worker, a script, a test', () => {
  it('starts the work at once when after() refuses', () => {
    after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope.');
    });
    notify(opts);
    expect(createNotification).toHaveBeenCalledWith(opts);
  });
});

describe('never able to undo the business action', () => {
  it('swallows a failure in the deferred work', async () => {
    let scheduled: (() => Promise<unknown>) | undefined;
    after.mockImplementation((fn: () => Promise<unknown>) => {
      scheduled = fn;
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    afterResponse(async () => {
      throw new Error('database gone');
    });
    await expect(scheduled!()).resolves.toBeUndefined();
    quiet.mockRestore();
  });
});
