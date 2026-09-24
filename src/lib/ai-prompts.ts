/**
 * THE WORDS THE SYSTEM SAYS TO THE AI, WHERE THE SELLER CAN READ THEM.
 *
 * Every AI feature here is a prompt plus some of your own numbers. The
 * prompts were written into the files that use them — which means the one
 * person who knows whether "be concise" is right for their business, in
 * their dialect, for their customers, could not change a word of it.
 *
 * So each job's prompt is named, has a default, and can be overridden per
 * company. The default is shown beside the override, because a seller
 * editing a prompt needs to see what they are replacing, and because a
 * prompt they have broken must be one keystroke from working again.
 *
 * The override is stored; the DEFAULT is not. A default kept in the
 * database is a default that stops improving when we improve it, and a
 * company that never touched a prompt should get this year's wording and
 * not the one they were created with.
 */

export interface AiJob {
  key: string;
  label: string;
  /** Where in the system this runs, in a seller's words. */
  where: string;
  /** What changing it will and will not affect. */
  note: string;
  /** Values the system substitutes — named so nobody deletes one by accident. */
  slots: string[];
  default: string;
}

/**
 * The house prompt goes in front of every other one.
 *
 * Its own job because it is the one place to say something that is true of
 * the whole business — the currency, the dialect, the tone with customers —
 * without repeating it in six places that then drift.
 */
export const HOUSE_JOB = 'house';

export const AI_JOBS: AiJob[] = [
  {
    key: HOUSE_JOB,
    label: 'التعليمات العامة',
    where: 'تُضاف قبل كل طلب يذهب إلى الذكاء الاصطناعي',
    note: 'اكتب هنا ما يصحّ في كل الحالات: اسم متجرك، لهجتك، ما يجب ألا يُقال أبداً.',
    slots: [],
    default: '',
  },
  {
    key: 'assistant',
    label: 'المساعد الذكي',
    where: 'المحادثة التي تفتحها من الفقاعة أسفل الشاشة',
    note: 'يجيب على أسئلتك عن أرقامك أنت. لا يرى بيانات متجر آخر.',
    slots: ['{context}'],
    default: `أنت مستشار أعمال لمتجر إلكتروني، تتحدث العربية.
لديك أرقام هذا المتجر الحقيقية أمامك.

قواعد لا تُكسر:
١. لا تخترع رقماً أبداً. إن لم يكن الرقم في السياق، قل إنك لا تعرفه.
٢. فرّق بين الطلبات (طلب) والمبيعات الحقيقية (ما وصل وحُصِّل).
٣. أجب بإيجاز، وبما يمكن التصرف به اليوم — لا نصائح عامة.
٤. أجب بنفس لغة السؤال.`,
  },
  {
    key: 'daily_summary',
    label: 'الملخّص اليومي',
    where: 'الملخّص الذي يُكتب كل يوم عن أداء المتجر',
    note: 'يُبنى من أرقام اليوم فقط. تغيير النص لا يغيّر الأرقام.',
    slots: ['{context}'],
    default: `أنت محلل أعمال لمتجر إلكتروني.
حلّل الأرقام المُرفقة — وهي أرقام محققة، لا تقديرات.

قواعد لا تُكسر:
١. لا تخترع رقماً. استعمل ما في السياق فقط.
٢. اذكر ما تغيّر عن الأمس، لا ما هو ثابت.
٣. المخاطر قبل الفرص: ما الذي يحتاج تدخّلاً اليوم؟
٤. كل توصية يجب أن تكون قابلة للتنفيذ خلال يوم واحد.`,
  },
  {
    key: 'order_intake',
    label: 'قراءة الطلب من نص',
    where: 'عند لصق رسالة زبون لتحويلها إلى طلب',
    note: 'يقرأ الاسم والهاتف والعنوان. لا يقرّر السعر ولا المنتج — هذان من الكتالوج.',
    slots: ['{text}'],
    default: `استخرج بيانات الطلب من رسالة الزبون.
أعد JSON فقط، بلا شرح.

قواعد:
١. لا تخمّن ما ليس مكتوباً — اترك الحقل فارغاً.
٢. رقم الهاتف كما كُتب، بلا تنسيق.
٣. إن ذكر الزبون كمية، استخرجها؛ وإلا فواحدة.
٤. المدينة كما سمّاها هو، لا كما تظنها.`,
  },
  {
    key: 'landing_html',
    label: 'كتابة صفحة هبوط',
    where: 'عند توليد صفحة هبوط بالذكاء الاصطناعي',
    note: 'صفحة الهبوط تُنظَّف بعد التوليد — أي كود غير مسموح يُزال مهما طلبت.',
    slots: ['{product}', '{price}', '{currency}'],
    default: '',
  },
  {
    key: 'advisor',
    label: 'مستشار الأعمال',
    where: 'مركز الذكاء — التحليل الأعمق للأداء',
    note: 'يقرأ مدى أطول من الملخّص اليومي.',
    slots: ['{context}'],
    default: `أنت مستشار تنفيذي لمتجر إلكتروني.
أمامك سياق تشغيلي ومالي محقّق.

قواعد:
١. استند إلى المعطيات وحدها.
٢. فرّق بوضوح بين الطلب (عدد الطلبات) والربح الحقيقي (المحصَّل ناقص الكلفة).
٣. كن مهنياً وموجزاً وقابلاً للتنفيذ.
٤. أجب بنفس لغة السؤال.`,
  },
];

export function jobInfo(key: string): AiJob | undefined {
  return AI_JOBS.find((j) => j.key === key);
}

/** Longer than this is not a prompt, it is a document pasted by accident. */
export const MAX_PROMPT = 4000;

/**
 * The prompt for a job: the company's words if they wrote any, ours if not.
 *
 * Whitespace-only counts as not written. A seller who clears the box means
 * "go back to normal", and storing an empty string as an override would
 * instead send the model nothing at all.
 */
export function resolvePrompt(job: string, overrides: Record<string, string> | null | undefined): string {
  const own = overrides?.[job];
  if (typeof own === 'string' && own.trim()) return own.trim().slice(0, MAX_PROMPT);
  return jobInfo(job)?.default ?? '';
}

/**
 * Keep only the jobs we know, and only real text.
 *
 * An unknown key is not stored: it would sit in the settings forever,
 * invisible in the editor, and be read by nothing.
 */
export function sanitizePromptOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const job of AI_JOBS) {
    const v = (raw as Record<string, unknown>)[job.key];
    if (typeof v !== 'string') continue;
    const text = v.trim().slice(0, MAX_PROMPT);
    // An override equal to the default is not an override. Storing it would
    // freeze this company on today's wording.
    if (!text || text === job.default.trim()) continue;
    out[job.key] = text;
  }
  return out;
}

/**
 * Which slots a prompt forgot.
 *
 * Not an error — a seller may well want a prompt that ignores the context
 * — but the editor says so, because a summary prompt with no {context} is
 * a summary of nothing and the failure is silent otherwise.
 */
export function missingSlots(job: string, text: string): string[] {
  const info = jobInfo(job);
  if (!info) return [];
  return info.slots.filter((s) => !text.includes(s));
}
