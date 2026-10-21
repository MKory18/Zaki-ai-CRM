/**
 * THE ORDER OF A PRODUCT'S OFFERS — ONE MOVE, ONE RULE, FOR THE GRIP AND FOR THE ARROWS.
 *
 * The owner asked (21/10, the product page) for the offers to be reordered by dragging. The order is not decoration:
 * `GET /api/offers?productId=` returns them `sortOrder asc, quantity asc` and the landing page, the quick order and the
 * order screen show them in that order, so the first offer in the list is the first one a customer is offered.
 *
 * The screen moved an offer by SWAPPING two `sortOrder` values (`i` and `j`), which is only right while the stored values
 * are 0, 1, 2 … without a gap or a tie — and offers made by other doors (a generated set, a duplicated landing page) do
 * not promise that. A drag lands an offer several places away, so a swap is no longer a move at all.
 *
 * So a move here is stated as what the list LOOKS like afterwards, and every offer is numbered by the place it holds —
 * 0 … n-1. Only the offers whose stored number differs from their new place are written (one `PATCH { sortOrder }` each),
 * which is also how a list that already carried ties or gaps is healed by the first move made on it.
 *
 * The drag and the arrows both come through `moveOffer`, so they cannot disagree about what a move means; `moveAfterDrag`
 * only turns what the drag library reports («this id was dropped on that id») into the same two indexes.
 */

/** An offer as the list holds it: who it is and the number it is stored under. */
export interface Ranked {
  id: string;
  sortOrder: number;
}

export interface OfferMove {
  /** The ids in the order the list shows after the move. */
  ids: string[];
  /** The offers whose stored `sortOrder` is not the place they now hold — one write each, and nothing else is written. */
  writes: Array<{ id: string; sortOrder: number }>;
}

/**
 * Put the offer at `from` where `to` is. `null` when nothing moves — the same place, or a place that is not in the list —
 * so a caller never writes for a drop that went nowhere.
 */
export function moveOffer(list: readonly Ranked[], from: number, to: number): OfferMove | null {
  const last = list.length - 1;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || to < 0 || from > last || to > last || from === to) return null;

  const ordered = list.slice();
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);

  return {
    ids: ordered.map((o) => o.id),
    writes: ordered.flatMap((o, place) => (o.sortOrder === place ? [] : [{ id: o.id, sortOrder: place }])),
  };
}

/** What the drag library reports when a drag ends: the id that was carried and the id it was dropped on, if any. */
export interface DragEnd {
  active: { id: string | number };
  over: { id: string | number } | null;
}

/**
 * The move a finished drag asks for — or `null` for a drop on nothing, a drop on itself (the same place), and a drop on an id
 * that is not in this list (which one drop zone cannot produce, and which is refused anyway: the rule does not depend on the
 * library being set up right).
 */
export function moveAfterDrag(list: readonly Ranked[], end: DragEnd): OfferMove | null {
  const from = list.findIndex((o) => o.id === String(end.active.id));
  const to = end.over ? list.findIndex((o) => o.id === String(end.over?.id)) : -1;
  return moveOffer(list, from, to);
}
