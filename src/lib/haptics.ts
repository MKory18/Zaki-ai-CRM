'use client';

/**
 * A SHORT ANSWER IN THE HAND — WHERE THERE IS ONE.
 *
 * Say the true thing first: **iOS Safari does not support vibration**, on
 * any iPhone, and is not going to. `navigator.vibrate` is simply absent
 * there. So roughly half the warehouse gets nothing from this file, and
 * every place that calls it must already be saying the same thing on
 * screen — a tick, a shake, a line of text.
 *
 * Haptics are therefore a SECOND channel and never the first. A confirm
 * that only buzzes is a confirm half the staff never receive.
 *
 * The patterns are deliberately short. A long buzz in a quiet room is the
 * phone shouting; what is wanted is the feeling of a key pressing down.
 */

/** One tap: something was accepted. */
const CONFIRM = 35;

/** Two taps: something was refused. Different in KIND, not just length. */
const REFUSE = [30, 60, 30];

function buzz(pattern: number | number[]): void {
  try {
    // Absent on iOS, and refused without a gesture in some browsers — both
    // are ordinary, neither is an error worth surfacing.
    navigator.vibrate?.(pattern);
  } catch {
    /* the screen is still saying it */
  }
}

/** Accepted — an order confirmed, a parcel scanned, a payment recorded. */
export function hapticConfirm(): void {
  buzz(CONFIRM);
}

/** Refused — a validation failed, a server said no. */
export function hapticRefuse(): void {
  buzz(REFUSE);
}

/** Whether this device can answer at all, for a setting that says so honestly. */
export function hapticsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
