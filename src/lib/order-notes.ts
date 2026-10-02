/**
 * THE NOTE VOCABULARY — one owner.
 *
 * «Notes are the context layer. OrderNote: id, order_id, body, author_id,
 * created_at, kind. kind = follow_up | return | settlement | internal.
 * Immutable. No edit, no delete. Corrections are new notes. Surfaced on
 * settlement exceptions, return receiving, tracking and order detail.»
 *
 * Four kinds and their words lived inside one screen component, and the
 * second screen that needed them would have had its own copy — which is how
 * «متابعة» becomes «اتصال» on one screen and nobody chose that.
 *
 * The wire shape is here too: every reader of `/api/orders/[id]/notes` wants
 * the same five fields, and `authorName` is resolved by the route because a
 * note carries an id and a screen cannot look up a person.
 */

export const NOTE_KINDS = ['follow_up', 'return', 'settlement', 'internal'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_AR: Record<NoteKind, string> = {
  internal: 'داخلية',
  follow_up: 'متابعة',
  return: 'مرتجع',
  settlement: 'تسوية',
};

/** One note as the notes endpoint returns it. */
export interface OrderNote {
  id: string;
  body: string;
  /** A string, not `NoteKind`: a row written before a kind existed is read too. */
  kind: string;
  createdAt: string;
  authorName: string | null;
}

/** The kind's word, or the raw value when a row carries one we do not know. */
export function noteKindAr(kind: string): string {
  return NOTE_KIND_AR[kind as NoteKind] ?? kind;
}
