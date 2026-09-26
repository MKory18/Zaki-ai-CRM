'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { minorUnitFor } from '@/lib/currencies';

/**
 * WHICH CURRENCY THIS SCREEN IS LOOKING AT.
 *
 * Four money screens printed a hardcoded «$» — the dashboard, the
 * customers list, the performance screen, the product detail. A Jordanian
 * store's customer lifetime value therefore read «$1,250.00» when it was
 * 1,250 dinars, and a Syrian store's read dollars for lira. That is a
 * wrong number on a screen somebody makes decisions from, and it was not a
 * mistake anybody made on purpose: the endpoints those screens call do not
 * return a currency, so the screens had nothing to print but a guess.
 *
 * THE VALUE WAS ALREADY ON THE CLIENT.
 *
 * The shell knows it — the store chip in the header has been printing it
 * beside the country's name the whole time. So this carries it down rather
 * than adding it to a dozen endpoints, which would be a data-flow change
 * for something the page already has in hand.
 *
 * A SCREEN THAT SHOWS ANOTHER STORE'S FIGURES STILL SAYS SO.
 *
 * This is a DEFAULT, not an override: `<Money currency="SYP" />` wins.
 * Outside the shell — the sign-in and entry screens — there is no selected
 * store, so there is no default and an amount prints bare rather than
 * dressed in a code that might be wrong.
 */

export interface StoreCurrency {
  code: string;
  minorUnit: number;
}

const Ctx = createContext<StoreCurrency | null>(null);

export function StoreCurrencyProvider({
  code,
  children,
}: {
  /** The selected store's country currency, as the shell resolved it. */
  code: string;
  children: React.ReactNode;
}) {
  const value = useMemo<StoreCurrency>(
    // JOD has three decimals and the lira has two. A global two would lose
    // a tenth of a dinar every time somebody read a figure back.
    () => ({ code, minorUnit: minorUnitFor(code) ?? 2 }),
    [code]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside the shell, where no store has been chosen yet. */
export function useStoreCurrency(): StoreCurrency | null {
  return useContext(Ctx);
}
