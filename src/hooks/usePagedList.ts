'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { useLiveRefresh } from './useLiveRefresh';

/**
 * A LIST READ IN PAGES, WITH WHAT THE READER CHOSE — AS ONE HOOK.
 *
 * The orders screen and the customers screen each carry the same sixty lines:
 * a sequence number so a slow answer cannot overwrite a fast one, a 250ms
 * timer so typing does not ask the server per letter, «start again at page
 * one» whenever the choice changes, and the refresh on coming back to the tab
 * that reloads the page the reader is ON. The postponed, winback, returns and
 * tracking lists were about to be the third to sixth copy.
 *
 * ── WHAT IT GUARANTEES ──
 *
 *   • ONLY WHAT WAS CHOSEN IS SENT. An empty value, `all` and `undefined` are
 *     «no filter» and leave the address, so the route sees the same request it
 *     saw before the filter existed — and a saved link stays short.
 *   • A CHANGE OF CHOICE STARTS AGAIN AT PAGE ONE. Page 7 of a different list
 *     is not where the reader was. A burst of changes (two dropdowns in a row,
 *     a word typed) asks once, for the lot — the first load is immediate,
 *     because a screen must never open empty for a quarter of a second.
 *   • LATEST WINS. A second request while one is in the air replaces it; the
 *     slow one's answer is dropped, never drawn over the fast one's.
 *   • A PAGE TURN KEEPS THE CHOICES. `goTo(3)` asks for page 3 of the SAME list.
 *   • COMING BACK RELOADS THE PAGE YOU WERE ON, not the first (`useLiveRefresh`).
 *   • THE SERVER'S WORD IS THE PAGE. A request past the end is answered with
 *     the last page, and `pagination.page` says so — the hook does not guess.
 *   • AN ERROR KEEPS THE ROWS. A failed turn of the page leaves the page in
 *     hand on screen with the reason beside it; a blank list is a lie.
 *
 * `read` takes the response body to what the hook needs. It must be STABLE — a
 * module-level function, not one written in the render — because it is a
 * dependency of the loader, and a new one every render would load for ever.
 *
 * The URL is not written. A list's choices in the address bar are saved views,
 * which is a feature (the orders list has it), not a repair; a screen that wants
 * to be opened with a choice already made reads its own address once, as the
 * customers screen does.
 */

export interface Paging {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PagedRead<T, X> {
  rows: T[];
  pagination: Paging;
  /** Whatever else the route sends with the page — figures, the lead days. */
  extra: X;
}

export interface PagedOptions<T, X> {
  /** The route, no query. */
  url: string;
  /** What the reader chose. Empty, `all` and `undefined` are not sent. */
  params: Record<string, string | undefined>;
  /** Rows to a page: 25, like the orders screen. */
  limit?: number;
  /** The response body, read into rows, paging and the rest. Stable. */
  read: (body: unknown) => PagedRead<T, X>;
  /** How long a burst of changes is waited out. */
  debounceMs?: number;
}

const NOT_A_CHOICE = new Set(['', 'all']);

export function usePagedList<T, X = undefined>({ url, params, limit = 25, read, debounceMs = 250 }: PagedOptions<T, X>) {
  const [rows, setRows] = useState<T[]>([]);
  const [extra, setExtra] = useState<X | undefined>(undefined);
  const [pagination, setPagination] = useState<Paging>({ total: 0, page: 1, limit, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Latest wins: a second request while a page is in the air replaces it. */
  const seq = useRef(0);

  /**
   * What is sent, as a STRING — so a new `params` object with the same choices
   * is not a new question: `load` depends on the string, which compares by value.
   */
  const chosen = new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string] => entry[1] !== undefined && !NOT_A_CHOICE.has(entry[1]))
      .sort(([a], [b]) => a.localeCompare(b))
  ).toString();

  const load = useCallback(
    async (page: number) => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        const query = new URLSearchParams(chosen);
        query.set('page', String(page));
        query.set('limit', String(limit));
        const body = await apiJson<unknown>(`${url}?${query}`);
        if (mine !== seq.current) return; // a newer request already answered, or is about to
        const got = read(body);
        setRows(got.rows);
        setExtra(got.extra);
        setPagination(got.pagination);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'تعذّر التحميل');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [url, chosen, limit, read]
  );

  // A change of what was chosen asks again from page one — the first time at once, the rest after the burst.
  const first = useRef(true);
  useEffect(() => {
    const wait = first.current ? 0 : debounceMs;
    first.current = false;
    const timer = setTimeout(() => void load(1), wait);
    return () => clearTimeout(timer);
  }, [load, debounceMs]);

  /*
   * The page lives in a ref as well, for the same reason the loader does: the
   * refresh hook attaches its listeners once, so reading `pagination` through
   * the closure would refresh page one for ever.
   */
  const pageRef = useRef(pagination.page);
  useEffect(() => {
    pageRef.current = pagination.page;
  }, [pagination.page]);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useLiveRefresh(() => loadRef.current(pageRef.current), { initial: false });

  return {
    rows,
    extra,
    pagination,
    loading,
    error,
    /** Page `page` of the SAME list. */
    goTo: (page: number) => void load(page),
    /** The page the reader is on, again — after something they did changed it. */
    reload: () => load(pageRef.current),
  };
}
