/**
 * WHAT TO SAY WHEN A PLATFORM SENDS SOMEBODY BACK.
 *
 * Connecting an ad account is a round trip: the seller leaves for Meta, TikTok
 * or Snapchat, agrees or refuses, and the platform sends them back to
 * `/settings?connect=<outcome>`. The callback's own comment promised that
 * «the screen has its own sentence for each outcome» — and there was no
 * screen: `/settings` was not a page, so every one of those returns, the
 * success included, landed on a 404 and the seller was left to guess whether
 * anything had been connected.
 *
 * This is that sentence, one per outcome the callback can send, plus a
 * fallback for one it cannot. It reads only what the URL carries — an outcome
 * word, a platform, a count — and never a token, a code or an error body.
 */

const PLATFORM_AR: Record<string, string> = {
  META: 'ميتا',
  TIKTOK: 'تيك توك',
  SNAPCHAT: 'سناب شات',
};

export interface ConnectNotice {
  tone: 'good' | 'bad';
  text: string;
}

export function connectNotice(
  outcome: string | null,
  platform: string | null = null,
  count: string | null = null
): ConnectNotice | null {
  if (!outcome) return null;
  const name = (platform && PLATFORM_AR[platform.toUpperCase()]) || 'المنصّة';
  const accounts = count && /^\d{1,3}$/.test(count) ? Number(count) : null;

  switch (outcome) {
    case 'connected':
      return {
        tone: 'good',
        text: accounts ? `تمّ الربط مع ${name} — ${accounts} حساب إعلاني.` : `تمّ الربط مع ${name}.`,
      };
    case 'declined':
      return { tone: 'bad', text: `رفضتَ الربط عند ${name}، فلم يُربط شيء.` };
    case 'platform-refused':
      return { tone: 'bad', text: `${name} رفضت الطلب. حاول من جديد، وإن تكرّر راجع صلاحيات حسابك هناك.` };
    case 'bad-state':
      return { tone: 'bad', text: 'انتهت صلاحية رابط الربط أو أنه ليس لهذا الحساب. ابدأ الربط من جديد.' };
    case 'no-code':
      return { tone: 'bad', text: 'لم يصل رمز الربط من المنصّة. ابدأ الربط من جديد.' };
    case 'exchange-failed':
      return { tone: 'bad', text: `تعذّر إكمال الربط مع ${name}. ابدأ من جديد.` };
    case 'list-failed':
      return { tone: 'bad', text: `تعذّرت قراءة الحسابات الإعلانية من ${name}. حاول بعد قليل.` };
    case 'no-accounts':
      return { tone: 'bad', text: `لا حسابات إعلانية على هذا الدخول في ${name}.` };
    case 'unsupported':
      return { tone: 'bad', text: 'هذه المنصّة غير مدعومة.' };
    default:
      return { tone: 'bad', text: 'عادت المنصّة بنتيجة لا نعرفها. تحقّق من الحسابات الإعلانية قبل أن تعيد المحاولة.' };
  }
}
