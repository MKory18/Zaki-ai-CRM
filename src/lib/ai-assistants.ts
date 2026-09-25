/**
 * WHAT EACH ASSISTANT MAY SEE, AND WHAT IT MAY NEVER DO.
 *
 * One assistant answered everything, and it was handed the whole business:
 * revenue, cost of goods, commission, net profit. Anyone who could open the
 * assistant screen could ask "how much did we make" and be told — including
 * the people whose own commission is a line in that answer.
 *
 * So each assistant is narrow on purpose, and its narrowness is DATA the
 * service enforces rather than a habit of whoever wrote the prompt:
 *
 *   scopes  — the kinds of fact it may be given. A scope it does not hold
 *             is not fetched, so it cannot be leaked by a clever question.
 *   needs   — the permission the ASKER must hold for it to run at all.
 *   pii     — whether a customer's phone or address may be in its payload.
 *
 * And the rule that holds for every one of them, however it is prompted: an
 * assistant proposes. It never moves an order's state, never writes a cash
 * movement, never changes a price, never approves a settlement and never
 * touches the audit log. Those are the acts the business is accountable
 * for, and a suggestion is not an instruction.
 */

/** A kind of fact an assistant may be given. */
export const AI_SCOPES = ['orders', 'finance', 'inventory', 'campaigns', 'team', 'customer'] as const;
export type AiScope = (typeof AI_SCOPES)[number];

export const SCOPE_LABEL_AR: Record<AiScope, string> = {
  orders: 'الطلبات',
  finance: 'المالية',
  inventory: 'المخزون',
  campaigns: 'الحملات',
  team: 'الفريق',
  customer: 'سجل الزبون',
};

export const SCOPE_NOTE_AR: Record<AiScope, string> = {
  orders: 'أعداد الطلبات وحالاتها ونسب التأكيد والتسليم.',
  finance: 'الإيراد والتكاليف والعمولات وصافي الربح — أرقام المال.',
  inventory: 'أرصدة المخزون والنواقص وقائمة التجهيز.',
  campaigns: 'أداء الحملات وما جلبته.',
  team: 'أرقام أداء الموظفين.',
  customer: 'سجل الزبون المفتوح أمام الموظف — لا قائمة زبائن.',
};

export interface AssistantDef {
  key: string;
  label: string;
  /** Who it is for, in a seller's words. */
  who: string;
  where: string;
  /** The prompt job it uses (see ai-prompts.ts). */
  promptJob: string;
  /** The facts it may be given. Anything else is never fetched. */
  scopes: AiScope[];
  /**
   * Scopes the OWNER turns on themselves, starting at none. Only the
   * business-intelligence assistant has these: it is the one whose reach is
   * a decision rather than a job description.
   */
  optionalScopes?: AiScope[];
  /** The permission the person asking must hold. */
  needs: string;
  /** May a customer's phone or address be in its payload? */
  pii: boolean;
  note: string;
}

export const ASSISTANTS: AssistantDef[] = [
  {
    key: 'order_intake',
    label: 'مستخرج الطلبات',
    who: 'المودريتور',
    where: 'إنشاء طلب من رسالة ملصوقة',
    promptJob: 'order_intake',
    // Nothing at all: it reads the pasted text and returns fields. It is the
    // only assistant that touches a customer's words, and it touches nothing
    // else — no database read, so nothing of the business can leak into it.
    scopes: [],
    needs: 'orders.create',
    pii: true,
    note: 'يقرأ النص الملصوق فقط، ولا يقرأ من قاعدة البيانات شيئاً. مخرجه حقول تُراجَع قبل الحفظ، ولا يحفظ طلباً بنفسه.',
  },
  {
    key: 'confirmation',
    label: 'مساعد التأكيد',
    who: 'موظفة التأكيد',
    where: 'الطلب المفتوح في شاشة التأكيد',
    promptJob: 'confirmation',
    scopes: ['customer'],
    needs: 'confirmation.work',
    pii: true,
    note: 'يقرأ الطلب المفتوح وسجل صاحبه فقط. يقترح ما يُقال وينبّه على الخطورة ويصيغ الرسالة — ولا يغيّر حالة ولا سعراً ولا كمية ولا خصماً.',
  },
  {
    key: 'picking',
    label: 'مساعد التجهيز',
    who: 'المخزن',
    where: 'شاشة التجهيز',
    promptJob: 'picking',
    scopes: ['inventory'],
    needs: 'ops.prepare',
    // The warehouse packs boxes. A name, a phone and an address in that
    // payload would be customer data sitting where it is not needed — and
    // the one place it is guaranteed nobody is accountable for it.
    pii: false,
    note: 'يقرأ المنتجات وأرصدة المخزون وقائمة تجهيز اليوم. لا هاتف ولا عنوان ولا اسم زبون — أبداً.',
  },
  {
    key: 'intelligence',
    label: 'مركز الذكاء',
    who: 'المالك والمدير',
    where: '/growth/intelligence',
    promptJob: 'advisor',
    // Starts at NOTHING. Every scope below is a decision the owner takes.
    scopes: [],
    optionalScopes: ['orders', 'finance', 'inventory', 'campaigns', 'team'],
    needs: 'growth.intelligence',
    pii: false,
    note: 'لا يقرأ إلا المجالات التي تؤشّرها أنت، والافتراضي: ولا مجال. يقترح إجراءات ولا ينفّذ حركة مالية ولا تغيير سعر ولا انتقال حالة ولا اعتماد تسوية.',
  },
];

export function assistantByKey(key: string): AssistantDef | undefined {
  return ASSISTANTS.find((a) => a.key === key);
}

/** The scope a finance figure belongs to — named once, so nothing guesses. */
export const FINANCE_SCOPE: AiScope = 'finance';

/**
 * The permission that opens the money to an assistant.
 *
 * The assistant used to hand revenue, cost, commission and net profit to
 * anybody holding ai.use — a permission granted so people could ask about
 * their orders. Seeing the company's profit is a different decision, and it
 * has its own key already.
 */
export const FINANCE_PERMISSION = 'reports.view';

/** The scopes an assistant may actually use, given what the owner turned on. */
export function scopesOf(def: AssistantDef, enabled: string[] | null | undefined): AiScope[] {
  const optional = (def.optionalScopes ?? []).filter((s) => (enabled ?? []).includes(s));
  return [...def.scopes, ...optional];
}

/** Only the names this system knows — anything else is dropped, never guessed. */
export function sanitizeScopes(raw: unknown): AiScope[] {
  if (!Array.isArray(raw)) return [];
  return AI_SCOPES.filter((s) => raw.includes(s));
}
