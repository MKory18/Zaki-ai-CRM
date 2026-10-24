/**
 * WHAT IS WAITING FOR ME, IN THE BAR AT THE TOP OF EVERY SCREEN.
 *
 * The header already carried one number, and it was the right idea applied
 * to one role: «how many orders are waiting to be pulled» for whoever
 * pulls. Everybody else got a bar that was identical whatever their job —
 * a shipping clerk with forty parcels ready to go, a warehouse with a
 * pallet of returns nobody has counted in, an owner with change requests
 * sitting past their deadline, all looking at the same store name and the
 * same bell.
 *
 * So the one number becomes a small set, and the server still decides which
 * of them a person sees — by permission, exactly as the counter did. What
 * changes is that the question is now «what is waiting for YOU» rather than
 * «is confirmation busy».
 *
 * NOTHING HERE IS A LIST. A count and a link to the screen that owns it. A
 * header that opened a list would be a second door into data with its own
 * idea of who may walk through it, which is the reasoning the confirmation
 * counter was written with and it has not changed.
 *
 * AND IT IS SHORT ON PURPOSE. Seven controls in a 375-pixel bar is how a
 * bell gets missed and a logout gets hit — the header's own comment, and
 * it is right. A phone shows the single most urgent; a desk shows three.
 */

export type WorkKey =
  | 'CONFIRM_POOL'
  | 'MY_UNCONFIRMED'
  | 'READY_TO_SHIP'
  | 'RETURNS_WAITING'
  | 'CHANGE_REQUESTS'
  | 'LATE_SHIPMENTS';

export interface WorkKind {
  key: WorkKey;
  ar: string;
  /** Any one of these lets a person see it. */
  permissions: readonly string[];
  /** Where the work is done. Null when the count is a fact, not a queue. */
  href: string | null;
  /**
   * An icon name from the shell's own map — never a character, and
   * never one the map does not have: a guard checks every key here
   * against it, because a missing icon renders as nothing at all.
   */
  icon: string;
  /**
   * How loudly it reads when it is not zero. `urgent` is for work that is
   * already late: a parcel past its transit days, a decision past its SLA.
   */
  tone: 'urgent' | 'normal';
  /**
   * WHAT TO DO ABOUT IT, IN ONE SENTENCE — for the dashboard's «شغلك اليوم».
   *
   * The header chip says «14 مرتجع» and that is all a chip has room for. The
   * dashboard has room to say what the number is FOR: a count nobody has told
   * what to do about is a count read and forgotten. One sentence, in the
   * imperative, naming what the screen it leads to is for.
   */
  todo: string;
  /**
   * Lower sorts first — and on a phone only the first non-zero one shows.
   * Late work outranks waiting work, because waiting work is the job and
   * late work is the exception.
   */
  rank: number;
}

export const WORK_KINDS: readonly WorkKind[] = [
  {
    key: 'LATE_SHIPMENTS',
    ar: 'شحنة متأخّرة',
    permissions: ['ops.track'],
    href: '/ops/tracking',
    icon: 'Timer',
    tone: 'urgent',
    todo: 'تأخّرت عن مهلة منطقتها — تابعها مع شركة الشحن أو المندوب.',
    rank: 0,
  },
  {
    key: 'CHANGE_REQUESTS',
    ar: 'طلب تعديل ينتظر',
    permissions: ['control.change_requests'],
    href: '/control/change-requests',
    icon: 'FilePen',
    tone: 'urgent',
    todo: 'تنتظر قراراً، وبعضها يوقف تقدّم الطلب — راجعها واتخذ قرارك.',
    rank: 1,
  },
  {
    key: 'RETURNS_WAITING',
    ar: 'مرتجع لم يُستلم',
    permissions: ['ops.returns'],
    href: '/ops/returns',
    icon: 'Undo2',
    tone: 'normal',
    todo: 'سجّل استلامها بعدّها وفحصها — لا يدخل المخزون شيء قبل ذلك.',
    rank: 2,
  },
  {
    key: 'READY_TO_SHIP',
    ar: 'جاهز للشحن',
    permissions: ['ops.ship'],
    href: '/ops/shipments/new',
    icon: 'Truck',
    tone: 'normal',
    todo: 'أنشئ لها شحنة واختر شركة الشحن.',
    rank: 3,
  },
  {
    key: 'CONFIRM_POOL',
    ar: 'بانتظار التأكيد',
    permissions: ['confirmation.pull', 'confirmation.supervise'],
    href: '/confirmation/queue',
    icon: 'Inbox',
    tone: 'normal',
    todo: 'اسحب منها وابدأ بالاتصال بالزبائن.',
    rank: 4,
  },
  {
    /**
     * A moderator's own orders, still unconfirmed. No link, and that is
     * deliberate: the pool is not theirs to open, and a counter that led to
     * a list would be the list by another door — the rule the confirmation
     * counter was written with.
     */
    key: 'MY_UNCONFIRMED',
    ar: 'طلباتي غير المؤكَّدة',
    permissions: ['orders.create'],
    href: null,
    icon: 'ClipboardList',
    tone: 'normal',
    todo: 'أدخلتها ولم يؤكّدها موظف التأكيد بعد — تتابعها من «الطلبات».',
    rank: 5,
  },
];

export function workKind(key: WorkKey): WorkKind | undefined {
  return WORK_KINDS.find((k) => k.key === key);
}

/**
 * WHICH KINDS THIS PERSON MAY SEE AT ALL.
 *
 * `can` is passed in rather than imported so this stays pure and the rule
 * is testable without a session.
 *
 * A moderator who also pulls sees the pool, not their own backlog: the two
 * would be the same orders counted twice, and the pool is the one they act
 * on. That was the confirmation counter's rule and it is kept.
 */
export function kindsFor(can: (permission: string) => boolean): WorkKind[] {
  const allowed = WORK_KINDS.filter((k) => k.permissions.some((p) => can(p)));
  const pulls = allowed.some((k) => k.key === 'CONFIRM_POOL');
  return allowed
    .filter((k) => !(pulls && k.key === 'MY_UNCONFIRMED'))
    .map((k) =>
      // The pool is WORKED at the top of «طلباتي» (the pull panel); the
      // supervisor's page is the one that lists it. Whoever supervises opens
      // that; whoever only pulls opens her desk.
      k.key === 'CONFIRM_POOL' && !can('confirmation.supervise') ? { ...k, href: '/confirmation/mine' } : k
    );
}

export interface WorkItem {
  key: WorkKey;
  ar: string;
  count: number;
  href: string | null;
  icon: string;
  tone: WorkKind['tone'];
}

/**
 * What the bar actually shows: the non-zero ones, worst first, capped.
 *
 * A zero is not news. Showing «0 مرتجع» teaches people to stop reading the
 * row, and then the day it says 14 nobody sees it.
 */
export function visibleWork(items: readonly WorkItem[], limit: number): WorkItem[] {
  return [...items]
    .filter((i) => i.count > 0)
    .sort((a, b) => (workKind(a.key)?.rank ?? 9) - (workKind(b.key)?.rank ?? 9))
    .slice(0, Math.max(0, limit));
}
