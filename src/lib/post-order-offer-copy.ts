/**
 * THE WORDS OF THE OFFER AFTER THE ORDER — and nothing else.
 *
 * This file is a leaf on purpose: it imports nothing, so a CLIENT component
 * may read it. `post-order-offer.ts` beside it is the domain module and it
 * knows about Prisma — importing that into a `'use client'` screen for the
 * sake of one Arabic label would pull the whole Prisma client into the
 * browser bundle, which `db.ts` carries no `server-only` marker to stop.
 * The repo has already made this split once, and said why: «it is a domain
 * module that knows about Prisma, while `store-pages.ts` must stay
 * client-safe».
 *
 * The RULES stay on the server, where every figure and every refusal is
 * decided. Only the sentences live here, because the sentences are read on
 * both sides of the wire: the thank-you screen the customer sees and the
 * order screen the confirmation team works from.
 */

/**
 * WHAT THE CONFIRMATION TEAM READS ON THAT LINE.
 *
 * One string, in one place, because it is drawn on the order screen and
 * written into the order's activity entry, and those two must never say
 * different things about the same row.
 *
 * «منتجات إضافية» named the row and said nothing about the moment, and the
 * moment is the whole of what the person on the phone needs: a line the
 * customer chose themselves, before anybody called, is not a line this
 * agent sold — and the total they are about to read aloud moved after the
 * order was placed.
 */
export const POST_ORDER_ADDITION_AR = 'زيادة بعد الطلب';

/** Why the offer may not be taken. One code per sentence of the owner's rule. */
export type PostOrderRefusal =
  | 'NOT_NEW'
  | 'CONTACTED'
  | 'WINDOW_PASSED'
  | 'ALREADY_ADDED'
  | 'NOT_IN_ORDER'
  | 'OFFER_GONE';

/**
 * What the customer is told, and it is the truth rather than a shrug.
 *
 * Each one names what happened and, where there is one, the way forward: an
 * order somebody is already working is not a dead end, it is a phone call.
 * «حدث خطأ» would be a lie about six different situations, and «انتهت
 * المهلة» would be a lie about five of them.
 *
 * The SERVER sends the sentence. A map of codes kept in the page would be a
 * second copy of this file's only content, free to drift, and the page would
 * then be explaining a decision it did not make.
 */
export const POST_ORDER_REFUSAL_AR: Record<PostOrderRefusal, string> = {
  NOT_NEW: 'طلبك صار تحت التنفيذ — حكي معنا وبنزيدها لك.',
  CONTACTED: 'تواصلنا معك بخصوص الطلب — خبّر الموظف وبيزيدها لك.',
  WINDOW_PASSED: 'انتهت مهلة الإضافة على هذا الطلب — حكي معنا وبنزيدها لك.',
  ALREADY_ADDED: 'هذا العرض مضاف لطلبك من قبل.',
  NOT_IN_ORDER: 'هذا العرض ليس على منتجٍ في طلبك.',
  OFFER_GONE: 'العرض غير متاح حالياً.',
};
