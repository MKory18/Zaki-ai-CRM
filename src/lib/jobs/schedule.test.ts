import { describe, expect, it } from 'vitest';
import { isDue, overdueBy, scheduleAr } from './schedule';

/**
 * A SCHEDULE THAT SURVIVES A RESTART.
 *
 * The worker kept each job's next-due time in a variable that started at
 * zero, so every deploy re-ran every job. The idempotent ones shrugged; the
 * ones that send a person a message sent it twice, and a reminder arriving
 * twice teaches people to ignore reminders.
 *
 * And "daily" meant "every 86400 seconds from whenever the worker last
 * started". A closing reminder meant for 16:45 — so somebody counts the
 * drawer before going home — drifted to whatever hour the server was last
 * restarted at, and then stayed there.
 *
 * Both faults have one cure: ask the run log, not a variable.
 */

const TZ = 'Asia/Damascus';
/** 2026-09-25 in Damascus; the offset is +3 in September. */
const at = (hhmm: string) => new Date(`2026-09-25T${hhmm}:00.000+03:00`);
const yesterday = (hhmm: string) => new Date(`2026-09-24T${hhmm}:00.000+03:00`);

const DAILY = { everySeconds: 86_400, at: '16:45', timezone: TZ };
const EVERY_5_MIN = { everySeconds: 300 };

describe('a job with a clock time', () => {
  it('is not due before its hour, however long since it last ran', () => {
    expect(isDue(DAILY, yesterday('16:45'), at('09:00'))).toBe(false);
    expect(isDue(DAILY, null, at('09:00'))).toBe(false);
  });

  it('is due once its hour has passed', () => {
    expect(isDue(DAILY, yesterday('16:45'), at('16:45'))).toBe(true);
    expect(isDue(DAILY, yesterday('16:45'), at('17:30'))).toBe(true);
  });

  it('and is NOT due again the same day, however many times the worker restarts', () => {
    // This is the fault: every deploy used to re-fire it.
    expect(isDue(DAILY, at('16:45'), at('18:00'))).toBe(false);
    expect(isDue(DAILY, at('16:46'), at('23:59'))).toBe(false);
  });

  it('a manual run earlier in the day does not cancel the scheduled one', () => {
    // Somebody pressed "run" at 09:00 to check something. The 16:45 run is
    // still owed — it is the one the reminder is for.
    expect(isDue(DAILY, at('09:00'), at('16:45'))).toBe(true);
  });

  it('and it comes due again the next day', () => {
    expect(isDue(DAILY, yesterday('17:00'), at('16:45'))).toBe(true);
  });

  it('a clock time nobody can read falls back to the interval, never to silence', () => {
    // A typo in a schedule must not quietly stop the work.
    const broken = { everySeconds: 300, at: 'quarter to five', timezone: TZ };
    expect(isDue(broken, null, at('09:00'))).toBe(true);
    expect(isDue(broken, at('08:54'), at('09:00'))).toBe(true);
    expect(isDue(broken, at('08:58'), at('09:00'))).toBe(false);
  });
});

describe('a job on an interval', () => {
  it('is due when the interval has passed since it last STARTED', () => {
    expect(isDue(EVERY_5_MIN, at('09:00'), at('09:05'))).toBe(true);
    expect(isDue(EVERY_5_MIN, at('09:00'), at('09:04'))).toBe(false);
  });

  it('and one that never ran is due now', () => {
    expect(isDue(EVERY_5_MIN, null, at('09:00'))).toBe(true);
  });
});

describe('overdue, which is what turns the screen red', () => {
  it('a daily job is not late before its hour — it used to look late every morning', () => {
    expect(overdueBy(DAILY, yesterday('16:45'), at('09:00'))).toBe(0);
  });

  it('it is late once the hour passed and it has not run', () => {
    expect(overdueBy(DAILY, yesterday('16:45'), at('18:45'))).toBe(120 * 60);
  });

  it('and not late at all once it has run today', () => {
    expect(overdueBy(DAILY, at('16:46'), at('20:00'))).toBe(0);
  });

  it('an interval job is late after twice its interval', () => {
    expect(overdueBy(EVERY_5_MIN, at('09:00'), at('09:09'))).toBe(0);
    expect(overdueBy(EVERY_5_MIN, at('09:00'), at('09:20'))).toBeGreaterThan(0);
  });

  it('and one that has never succeeded is late from the start', () => {
    expect(overdueBy(EVERY_5_MIN, null, at('09:00'))).toBeGreaterThan(0);
  });
});

describe('what the screen says', () => {
  it('reads the schedule in words, not in seconds', () => {
    expect(scheduleAr(DAILY)).toBe('يومياً 16:45');
    expect(scheduleAr({ everySeconds: 300 })).toBe('كل 5 دقيقة');
    expect(scheduleAr({ everySeconds: 7200 })).toBe('كل 2 ساعة');
    expect(scheduleAr({ everySeconds: 86_400 })).toBe('كل 1 يوم');
  });
});
