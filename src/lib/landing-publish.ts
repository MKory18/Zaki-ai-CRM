/**
 * THE QUESTION ASKED BEFORE A PAGE GOES LIVE — OR COMES DOWN.
 *
 * «النشر بتأكيد.» Publishing was a toggle: one press and the page was on the
 * open internet, one press and it was gone. Everything else in this system
 * that a customer can feel asks first.
 *
 * COMING DOWN IS THE PRESS THAT NEEDS THE QUESTION MORE, and it is the one
 * nobody thinks to guard. A published page is usually a page an advert
 * points at, and every click on that advert has already been paid for;
 * unpublishing sends the next hour of them to a page that does not answer.
 * Taking a page down is cheap to do and expensive to have done.
 *
 * AND PUBLISHING SAVES FIRST, so the question says so. The editor writes the
 * page before it flips the flag — the published page must be what is on the
 * screen, not what was on it at the last save — which means pressing «نشر»
 * publishes edits the seller may not have decided to publish. A
 * confirmation that did not mention that would be hiding the half of the
 * act that surprises people.
 *
 * ONE SOURCE FOR BOTH BUTTONS. The toggle is on the editor's header and on
 * every row of the list. Two sets of words is how one of them ends up
 * promising something the other does not.
 */

export interface PublishQuestion {
  title: string;
  body: string;
  confirmLabel: string;
  tone: 'danger' | 'normal';
}

/**
 * @param publishing `true` when the press would put the page live.
 * @param address    What a shopper would type — the page's own domain when
 *                   it has a verified one, otherwise /lp/<slug>. Shown
 *                   because «نشر» means «at this address» and a seller with
 *                   several pages is choosing between addresses.
 * @param unsaved    Whether the editor holds edits not yet written. Only
 *                   the editor knows; the list passes `false`.
 */
export function publishQuestion(
  publishing: boolean,
  address: string,
  unsaved = false
): PublishQuestion {
  if (publishing) {
    return {
      title: 'تُنشر الصفحة الآن؟',
      body: unsaved
        ? `سيُحفظ ما في المحرّر أوّلاً ثمّ تُنشر، فتصبح مفتوحةً لأيّ شخصٍ يعرف العنوان: ${address} — وما لم تقرّر نشره بعد سيُنشر معها.`
        : `تصبح مفتوحةً لأيّ شخصٍ يعرف العنوان: ${address}`,
      confirmLabel: 'انشر',
      tone: 'normal',
    };
  }
  return {
    title: 'تُسحب الصفحة من النشر؟',
    // The consequence a seller does not think of, said first.
    body: `أيّ إعلانٍ يشير إلى ${address} سيصل بعدها إلى صفحةٍ لا تُفتح، والنقراتُ مدفوعة. الطلباتُ السابقة وأرقامُ الصفحة تبقى كما هي.`,
    confirmLabel: 'اسحبها',
    tone: 'danger',
  };
}
