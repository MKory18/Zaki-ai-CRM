import { updateCompanySettings } from './company-settings';
import { db } from './db';

/**
 * ===========================================================================
 * بوابة الإطلاق — المفاتيح، ومن يملكها، ومتى تُراجَع.
 * ===========================================================================
 *
 * THE BRIEF ASKED FOR THREE FLAGS. IT GOT A REGISTRY THAT CAN SAY «NO SUCH
 * SWITCH», BECAUSE TWO OF THE THREE FEATURES DO NOT EXIST.
 *
 * Measured on this tree on 2026-10-02, before a line of this file was
 * written:
 *
 *   • `featureFlag` / `launchFlag` / `feature_flag` across all of `src`:
 *     zero hits. There was no flag system at all, so the three switches the
 *     brief demands had nowhere to live.
 *   • `/growth/ads-agent`: no route, no page, no component. The growth shell
 *     holds campaigns, intelligence, performance, telegram and whatsapp —
 *     and nothing else. `src/lib/ads/*` is three READ adapters and a sync;
 *     no adapter writes to an ad account, and the words `L0`, `autonomy`
 *     and `agentLevel` appear nowhere in `src`.
 *   • p80-derived late thresholds: the p80 exists — `summariseDays` in
 *     `delivery-time.ts` returns `slowDays` at the 80th percentile — but it
 *     is used to PROMISE a customer a date. `deliveryFee.lateThresholdDays`,
 *     the number that decides «is this order late», is still typed by hand
 *     in `CourierFees.tsx` and still defaults to 3 for everywhere. Nothing
 *     derives one from the other. The feature the brief flags is the bridge
 *     between them, and the bridge is not built.
 *
 * SO WHY NOT JUST DECLARE THEM `false`?
 *
 * Because `false` is a promise that `true` would do something. A reviewer
 * reading `adsAgent: false` concludes the ads agent is built and switched
 * off — that someone could turn it on next week, and that turning it on is
 * the risk being managed. None of that is true. The risk being managed is
 * the opposite one: that the launch checklist shows three green «OFF» rows
 * and everybody stops asking, and the ads agent ships later with no gate at
 * all because the gate was already ticked.
 *
 * A flag set OFF on a feature that does not exist is not readiness. It is
 * theatre. So an absent feature gets its own KIND — `UNBUILT` — which:
 *
 *   1. is not `'OFF'`, so no `state === 'OFF'` comparison anywhere can
 *      mistake it for a switch that is merely down;
 *   2. cannot be stored. `setLaunchFlag` REFUSES the key outright, so there
 *      is no sequence of API calls that produces an ON value for it;
 *   3. is ignored by the resolver even if a value is already sitting in the
 *      database — a hand-edited settings document cannot turn it on either;
 *   4. carries `absent`: the sentence that says what was looked for and not
 *      found, so the next reader does not have to repeat the search;
 *   5. becomes ON only by EDITING THIS FILE — changing the kind to `SWITCH`.
 *      Which is the honest cost: wiring a gate to a feature is a decision
 *      somebody makes in a diff, not a toggle somebody flips in a screen.
 *
 * And the third clause of the brief — «every AI action is proposal-only» —
 * is not a switch either, in the other direction. It is not a feature that
 * could be turned on; it is a property that is currently true and must stay
 * true. A flag for it would invite exactly the wrong reading: «proposal-only
 * is OFF, we should turn it on before launch». So it gets `INVARIANT`, which
 * names the test that holds it instead of a state that could be flipped.
 *
 * ===========================================================================
 * WHERE THE STATE LIVES, AND WHY
 * ===========================================================================
 *
 * Three honest options, each with a real cost:
 *
 *   A CODE CONSTANT needs a deploy to flip. That sounds safe and is not:
 *   if flipping the ads agent on means editing a constant, then the flag is
 *   not a flag — it is the feature's own `if`, and the «14 days OFF» hold is
 *   enforced by whoever remembers. There is also no record of WHO flipped it
 *   beyond a commit, and a commit is not where this business keeps its
 *   accountability.
 *
 *   AN ENV VAR is invisible to the app's own audit. This codebase's entire
 *   money story — settlement approval, commission locking, reversing
 *   entries — rests on `logAudit` rows that say who did what and when. A
 *   switch that gates an autonomous ads agent and leaves no audit row is
 *   precisely the one switch nobody will be able to explain afterwards. It
 *   also cannot be read per company, and this is a multi-company system.
 *
 *   A DATABASE ROW can be flipped by anyone with the screen. That is the
 *   real cost, and it is the cost this house has already chosen to pay
 *   everywhere else — `performance-settings.ts`, the AI settings, the
 *   message templates — and it pays it the same way every time:
 *   `requirePermission` on the route, `logAudit` with `previousData` and
 *   `newData`, the write funnelled through `updateCompanySettings` so a
 *   row lock stops two savers from overwriting each other, and a parse
 *   function that drops anything it does not recognise.
 *
 * So: a database row — specifically the `launchFlags` key of the existing
 * `Company.settings` JSON document. This is the house answer, not a fourth
 * way, and it needs NO SCHEMA CHANGE: the column is already there and
 * already shared by several owners, each under its own key.
 *
 * Two things the row deliberately does NOT get to decide, because they are
 * governance rather than configuration, and governance belongs in the diff:
 *
 *   • the OWNER and the REVIEW DATE. A flag whose owner can be edited in a
 *     screen has no owner. These are declared here or the flag does not
 *     compile — see `declareFlag`.
 *   • the KIND. A screen cannot promote `UNBUILT` to a working switch,
 *     because the feature it would gate still would not exist.
 *
 * ===========================================================================
 * «VISIBLE, NOT SILENTLY EXPIRED»
 * ===========================================================================
 *
 * A review date that only appears in a report is a comment. Two candidate
 * meanings of «visible», and the one chosen:
 *
 *   REJECTED — warn and keep working. That is what a code comment already
 *   does, and the failure it prevents is none: a flag that keeps working
 *   past its review is exactly the temporary switch that became permanent,
 *   which is the thing the brief names.
 *
 *   CHOSEN — a flag past its review date resolves to `EXPIRED`, and
 *   `assertFlagOpen` REFUSES it with its own sentence and its own code,
 *   distinct from OFF. The review date is therefore a deadline with teeth:
 *   the owner either extends it in this file (a diff, with their name on it)
 *   or the gate closes.
 *
 * The cost is stated plainly: a feature behind an expired flag STOPS on a
 * date nobody is standing in front of. That is a real operational risk and
 * it is the lesser one — a switch that outlives its review has nobody left
 * who can say why it is on. Today the cost is zero in practice: no flag in
 * this registry is a live switch, so nothing can stop. By the time one is,
 * the behaviour is documented here and pinned by a test.
 *
 * `launchFlagReport` surfaces `overdue` and `daysOverdue` for every kind,
 * including the two unbuilt ones — «the review date passed and it still is
 * not built» is the single most useful thing this registry can say.
 */

/** A day, as `YYYY-MM-DD`. */
/*
 * The template literal is the point: `${number}-${number}-${number}` refuses
 * `'soon'`, `'TBD'` and `''` AT COMPILE TIME. It still accepts `'1-2-3'`,
 * which is why `declareFlag` also round-trips every date through `Date` —
 * the type stops the careless value, the runtime stops the impossible one.
 */
export type IsoDate = `${number}-${number}-${number}`;

/**
 * What a declaration IS, as opposed to what it says.
 *
 *   SWITCH    — a real gate on a feature that exists. It has a state.
 *   UNBUILT   — the feature does not exist. There is no state to have.
 *   INVARIANT — not a gate at all: a property held by a test.
 */
export type FlagKind = 'SWITCH' | 'UNBUILT' | 'INVARIANT';

/**
 * What a flag resolves to.
 *
 * Five values, not a boolean, and deliberately not comparable: `'UNBUILT'`
 * is not `'OFF'`, so nothing can read «off» and mean «absent». The two kinds
 * that are not switches resolve to their own names, so the state and the
 * kind never disagree.
 */
export type FlagState = 'ON' | 'OFF' | 'EXPIRED' | 'UNBUILT' | 'INVARIANT';

interface FlagCommon {
  /** Stable key. Lowercase, dashes — it ends up in a settings document. */
  key: string;
  /** What this gates, in the words a person reads. */
  ar: string;
  /**
   * A PERSON. Not a role, not a team, not «المالك».
   *
   * A role cannot be asked why the switch is still on nine months later;
   * a person can. `declareFlag` refuses the known evasions by name.
   */
  owner: string;
  /** The day this flag must be decided again. Past it, the gate closes. */
  reviewOn: IsoDate;
}

export type FlagDecl =
  | (FlagCommon & {
      kind: 'SWITCH';
      /**
       * «all OFF for 14 days» — as code, not as a promise.
       *
       * Before this day the flag cannot be turned on: the writer refuses
       * it and the resolver ignores a stored `true`. The hold is the only
       * part of the brief that is a date rather than an opinion, so it is
       * the part most worth enforcing.
       */
      holdUntil: IsoDate;
    })
  | (FlagCommon & {
      kind: 'UNBUILT';
      /** What was searched for, and not found. Evidence, so nobody re-searches. */
      absent: string;
    })
  | (FlagCommon & {
      kind: 'INVARIANT';
      /** The test file that holds this property. A claim with no test is a hope. */
      heldBy: string;
    });

/** `''` collapses to `never`, so a blank string cannot satisfy the parameter. */
type NonBlank<S extends string> = S extends '' ? never : S;

/**
 * Words that look like an owner and are not one.
 *
 * The failure this prevents: `owner: 'الفريق'`. Nobody is the team. Six
 * months later the flag is still on, the review date is long past, and the
 * only honest answer to «whose is this» is «nobody's» — which is how a
 * temporary switch becomes permanent, which is the exact sentence in the
 * brief. Checked at module load so it cannot be merged, not in review.
 */
const NOT_A_NAME = [
  'tbd',
  'todo',
  'owner',
  'team',
  'المالك',
  'الفريق',
  'الإدارة',
  'الادارة',
  'فريق التطوير',
  'المدير',
  'n/a',
  'na',
  '-',
  '?',
];

/** Does this string round-trip as the calendar day it claims to be? */
function realDay(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * DECLARE A FLAG, OR FAIL TO COMPILE.
 *
 * The brief: «Make it impossible to declare one without them — the TYPE
 * should refuse it, not a code review.» Three layers, strongest first:
 *
 *   1. `FlagCommon` makes `owner` and `reviewOn` required, so omitting
 *      either is a compile error.
 *   2. `NonBlank` turns a literal `''` into `never`, so `owner: ''` is a
 *      compile error too — which is the loophole a required field leaves
 *      open, and the one a hurried author actually takes. `const T` is what
 *      makes this work: without it the argument widens to `string` and the
 *      empty literal is lost.
 *   3. What a type cannot see — `'   '`, `'2026-13-45'`, `'الفريق'`, a
 *      review date that falls before the hold even ends — throws HERE, at
 *      module load. A module that refuses to load is a loud failure in
 *      every test file that imports it; there is no quiet version.
 */
export function declareFlag<const T extends FlagDecl>(
  d: T & {
    key: NonBlank<T['key']>;
    ar: NonBlank<T['ar']>;
    owner: NonBlank<T['owner']>;
  }
): T {
  const f = d as FlagDecl;

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.key)) {
    throw new Error(`launch-flags: مفتاح غير صالح «${f.key}» — حروف صغيرة وأرقام وشرطات فقط.`);
  }
  if (!f.ar.trim()) {
    throw new Error(`launch-flags: «${f.key}» بلا وصف عربي.`);
  }
  if (!f.owner.trim()) {
    throw new Error(`launch-flags: «${f.key}» بلا مالك. المفتاح بلا مالك هو مفتاح مؤقّت يصير دائماً.`);
  }
  if (NOT_A_NAME.includes(f.owner.trim().toLowerCase())) {
    throw new Error(
      `launch-flags: «${f.key}» مالكه «${f.owner}» — هذا دور لا شخص. اكتب اسماً يمكن سؤاله.`
    );
  }
  if (!realDay(f.reviewOn)) {
    throw new Error(`launch-flags: «${f.key}» تاريخ مراجعته «${f.reviewOn}» ليس يوماً حقيقياً.`);
  }
  if (f.kind === 'SWITCH') {
    if (!realDay(f.holdUntil)) {
      throw new Error(`launch-flags: «${f.key}» تاريخ تجميده «${f.holdUntil}» ليس يوماً حقيقياً.`);
    }
    /*
     * A review date inside the hold is a contradiction the compiler cannot
     * see: the flag would expire before it was ever allowed to be turned on,
     * so the gate would close on a feature nobody had the chance to try.
     */
    if (f.reviewOn < f.holdUntil) {
      throw new Error(
        `launch-flags: «${f.key}» تاريخ المراجعة ${f.reviewOn} قبل نهاية التجميد ${f.holdUntil}.`
      );
    }
  }
  if (f.kind === 'UNBUILT' && !f.absent.trim()) {
    throw new Error(`launch-flags: «${f.key}» معلَّم كغير مبنيّ بلا دليل. اكتب ما بحثتَ عنه ولم تجده.`);
  }
  if (f.kind === 'INVARIANT' && !f.heldBy.trim()) {
    throw new Error(`launch-flags: «${f.key}» قاعدةٌ بلا اختبار يثبّتها. اكتب مسار الاختبار.`);
  }

  return d as T;
}

/**
 * ===========================================================================
 * THE THREE FLAGS THE BRIEF ASKS FOR
 * ===========================================================================
 *
 * Note what is NOT here: a `SWITCH`. Not one of the three clauses gates a
 * feature that exists today, and saying so is the whole value of this
 * registry. `SWITCH` is implemented, enforced and tested because day 15 of
 * this launch needs it — but today the honest count of live switches in
 * this system is zero, and a reader of this array can see that at a glance.
 */
export const LAUNCH_FLAGS: readonly FlagDecl[] = [
  declareFlag({
    kind: 'UNBUILT',
    key: 'ads-agent',
    ar: 'وكيل الإعلانات — يبدأ من المستوى صفر (اقتراح فقط، لا تنفيذ على الحساب الإعلاني).',
    owner: 'MKory18',
    reviewOn: '2026-10-16',
    absent:
      'لا يوجد مسار ولا شاشة /growth/ads-agent، ولا كلمة L0 أو autonomy أو agentLevel في src. ' +
      'مجلّد src/lib/ads فيه ثلاثة محوّلات قراءة ومزامنة فقط، ولا محوّل يكتب على حساب إعلاني. ' +
      'المستوى صفر ليس حالةً مضبوطة بل غياب الميزة كلها.',
  }),

  declareFlag({
    kind: 'UNBUILT',
    key: 'late-thresholds-p80',
    ar: 'حدود التأخير المشتقّة من المئين الثمانين — اقتراحٌ على المالك، لا كتابةٌ تلقائية.',
    owner: 'MKory18',
    reviewOn: '2026-10-16',
    absent:
      'المئين الثمانين موجود فعلاً: summariseDays في lib/delivery-time.ts يرجّع slowDays. ' +
      'لكنه يُستعمل لوعد الزبون بموعد وصول، لا لحدّ التأخير. ' +
      'deliveryFee.lateThresholdDays — الرقم الذي يقرّر «هل تأخّر هذا الطلب» — لا يزال يُكتب يدوياً ' +
      'في components/settings/CourierFees.tsx وافتراضه 3 لكل مكان. لا شيء يشتقّ أحدهما من الآخر.',
  }),

  declareFlag({
    kind: 'INVARIANT',
    key: 'ai-proposal-only',
    ar: 'كلّ إجراء ذكاءٍ اصطناعيّ اقتراحٌ فقط — لا يحرّك حالة طلب ولا مالاً ولا مخزوناً.',
    owner: 'MKory18',
    reviewOn: '2027-01-02',
    heldBy: 'src/lib/ai-proposal-only.test.ts',
  }),
];

/** The declaration for a key, or null. */
export function flagByKey(key: string): FlagDecl | null {
  return LAUNCH_FLAGS.find((f) => f.key === key) ?? null;
}

/*
 * Two keys with the same name would mean the second one silently never
 * resolves — `flagByKey` returns the first. Checked once, at module load.
 */
(() => {
  const seen = new Set<string>();
  for (const f of LAUNCH_FLAGS) {
    if (seen.has(f.key)) throw new Error(`launch-flags: مفتاح مكرّر «${f.key}».`);
    seen.add(f.key);
  }
})();

/** The settings key the stored states live under. */
export const SETTINGS_KEY = 'launchFlags';

/** The day, as a comparable string. */
/*
 * ISO day strings sort chronologically, so `a < b` IS «a is before b» with
 * no date arithmetic and no timezone to get wrong. A review date is a DAY,
 * not an instant: comparing instants would make a flag expire at a
 * different moment depending on where the server happens to be.
 */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The stored block, as this build understands it.
 *
 * Only declared SWITCH keys survive, and only as booleans. The failure this
 * prevents is the interesting one: a settings document that still holds
 * `{"ads-agent": true}` — left by a hand edit, a restored backup, or a
 * future build where that key WAS a switch — must not make an absent
 * feature look enabled. The value is dropped here, before any caller sees
 * it, so no resolver bug downstream can let it through.
 */
export function parseStoredFlags(raw: unknown): Record<string, boolean> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) {
    if (flagByKey(k)?.kind !== 'SWITCH') continue;
    /*
     * MEASURED AND UNVERIFIED, SO IT IS WRITTEN DOWN.
     *
     * This line is not covered. Deleting it leaves every test green
     * (mutation M8), and the reason is structural rather than sloppy: it
     * sits behind the kind filter above, and no key in `LAUNCH_FLAGS` is a
     * `SWITCH` today, so nothing can reach it. It is kept because it costs
     * nothing and because the first real switch will reach it on day one —
     * but it is defence nobody has watched work, and a reader deciding how
     * much to trust this function should know which line that is.
     */
    if (typeof v !== 'boolean') continue;
    out[k] = v;
  }
  return out;
}

export interface ResolvedFlag {
  key: string;
  ar: string;
  owner: string;
  reviewOn: IsoDate;
  kind: FlagKind;
  state: FlagState;
  /** The review date has passed. True for every kind — an unbuilt feature past review is news. */
  overdue: boolean;
  /** Days since the review date, 0 when not overdue. */
  daysOverdue: number;
  /** SWITCH only: the day it may first be turned on. */
  holdUntil?: IsoDate;
  /** SWITCH only: a stored `true` is being ignored because the hold has not ended. */
  heldByHold?: boolean;
  /** UNBUILT only: what was looked for and not found. */
  absent?: string;
  /** INVARIANT only: the test that holds it. */
  heldBy?: string;
  /** The sentence a person reads. */
  whyAr: string;
}

const DAY = 86_400_000;

/**
 * ONE FLAG'S STATE. Pure, so the whole truth table can be checked without a
 * database — which matters, because this function is the gate.
 *
 * Resolution order, and why each step comes where it does:
 *
 *   1. KIND FIRST. `UNBUILT` and `INVARIANT` resolve to themselves and the
 *      stored value is never consulted. This is what makes «absent» immune:
 *      not a convention, not a guard someone has to remember — there is no
 *      branch in which a stored value can reach the answer.
 *   2. THEN EXPIRY. A switch past its review date is `EXPIRED` whatever is
 *      stored. Checked before the stored value, because an expired flag is
 *      closed for the same reason whether it was on or off.
 *   3. THEN THE HOLD. A stored `true` inside the 14-day hold resolves OFF
 *      and says so (`heldByHold`). The writer already refuses it, so this
 *      only fires on a hand-edited document — defence in depth, and the one
 *      place where «all OFF for 14 days» is unconditionally true.
 *   4. THEN THE STORED VALUE. Absent means OFF. A launch gate defaults
 *      closed.
 */
export function resolveFlag(
  decl: FlagDecl,
  stored: Record<string, boolean>,
  now: Date = new Date()
): ResolvedFlag {
  const day = today(now);
  const overdue = day > decl.reviewOn;
  const daysOverdue = overdue
    ? Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${decl.reviewOn}T00:00:00Z`)) / DAY))
    : 0;

  const base = {
    key: decl.key,
    ar: decl.ar,
    owner: decl.owner,
    reviewOn: decl.reviewOn,
    kind: decl.kind,
    overdue,
    daysOverdue,
  };

  if (decl.kind === 'UNBUILT') {
    return {
      ...base,
      state: 'UNBUILT',
      absent: decl.absent,
      whyAr:
        `هذه الميزة غير مبنيّة — ليست مفتاحاً مُطفأً. ${decl.absent}` +
        (overdue ? ` ومرّ على تاريخ مراجعتها ${daysOverdue} يوماً.` : ''),
    };
  }

  if (decl.kind === 'INVARIANT') {
    return {
      ...base,
      state: 'INVARIANT',
      heldBy: decl.heldBy,
      whyAr:
        `قاعدةٌ مثبّتة، لا مفتاح. يحرسها ${decl.heldBy}، ولا معنى لتشغيلها أو إطفائها.` +
        (overdue ? ` وتاريخ إعادة التحقّق منها مرّ قبل ${daysOverdue} يوماً.` : ''),
    };
  }

  const wanted = stored[decl.key] === true;

  if (overdue) {
    return {
      ...base,
      state: 'EXPIRED',
      holdUntil: decl.holdUntil,
      whyAr:
        `انتهى تاريخ مراجعة هذا المفتاح (${decl.reviewOn}) قبل ${daysOverdue} يوماً، فأُغلقت البوابة. ` +
        `على ${decl.owner} أن يجدّد التاريخ أو يحذف المفتاح.`,
    };
  }

  if (wanted && day < decl.holdUntil) {
    return {
      ...base,
      state: 'OFF',
      holdUntil: decl.holdUntil,
      heldByHold: true,
      whyAr: `مُجمَّد حتى ${decl.holdUntil}: لا يُشغَّل قبل ذلك اليوم مهما كان المخزَّن.`,
    };
  }

  return {
    ...base,
    state: wanted ? 'ON' : 'OFF',
    holdUntil: decl.holdUntil,
    whyAr: wanted
      ? `مُشغَّل. مالكه ${decl.owner} ويُراجَع في ${decl.reviewOn}.`
      : `مُطفأ. مالكه ${decl.owner} ويُراجَع في ${decl.reviewOn}.`,
  };
}

/** The stored block for a company. A broken document reads as «nothing stored». */
async function storedFor(companyId: string): Promise<Record<string, boolean>> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  try {
    const all = company?.settings ? JSON.parse(company.settings) : {};
    return parseStoredFlags(all[SETTINGS_KEY]);
  } catch {
    /*
     * A broken settings blob must not take a gate down — but «down» here
     * means CLOSED, not open. Returning `{}` resolves every switch to OFF,
     * which is the safe direction for a launch gate: a corrupt document
     * stops a feature, it does not release one.
     *
     * ALSO UNVERIFIED, for the same reason as the line in
     * `parseStoredFlags`. Mutation M21 replaced this `{}` with a document
     * that turns a key on, and the suite stayed green: the only test that
     * reaches this path asks about an `UNBUILT` flag, whose answer does not
     * depend on what is stored. Nothing whose state comes from the database
     * exists to assert on until there is a `SWITCH`. What IS tested is that
     * a broken document does not throw and the gate stays shut.
     */
    return {};
  }
}

/** Every flag, resolved. This is what a screen or a report reads. */
export async function launchFlagReport(companyId: string, now: Date = new Date()): Promise<ResolvedFlag[]> {
  const stored = await storedFor(companyId);
  return LAUNCH_FLAGS.map((f) => resolveFlag(f, stored, now));
}

/** The flags whose review date has passed, whatever their kind. */
export function overdueFlags(report: ResolvedFlag[]): ResolvedFlag[] {
  return report.filter((f) => f.overdue);
}

/** One flag's state. */
export async function flagState(companyId: string, key: string, now: Date = new Date()): Promise<FlagState> {
  const decl = flagByKey(key);
  /*
   * An undeclared key is not OFF either — OFF would say «we know about this
   * and it is down». A typo in a guard must not read as a deliberate
   * closure, so it throws and the caller finds out at once.
   */
  if (!decl) throw new Error(`launch-flags: مفتاح غير معرَّف «${key}».`);
  return resolveFlag(decl, await storedFor(companyId), now).state;
}

/**
 * The boolean, for the one case where a boolean is honest: «may this run».
 *
 * `UNBUILT`, `INVARIANT` and `EXPIRED` are all false. The nuance is not
 * lost — it is simply not expressible in a boolean, which is why
 * `flagState` and `launchFlagReport` exist and why every refusal path uses
 * `assertFlagOpen` instead of this.
 */
export async function isFlagOn(companyId: string, key: string, now: Date = new Date()): Promise<boolean> {
  return (await flagState(companyId, key, now)) === 'ON';
}

/**
 * THE GATE IS CLOSED. Thrown by `assertFlagOpen`.
 *
 * `message` starts with `Forbidden:` on purpose. `apiError` maps any message
 * with that prefix to a 403 — so a future service that throws this through
 * a route which has never heard of launch flags still refuses correctly,
 * instead of falling through to the generic 500 that every other custom
 * message in this codebase would get. The precise Arabic sentence rides
 * along in `ar` for the routes that do know.
 */
export class LaunchFlagClosed extends Error {
  readonly code: FlagState;
  readonly ar: string;
  readonly flag: ResolvedFlag;
  constructor(flag: ResolvedFlag) {
    super(`Forbidden: launch flag ${flag.key} is ${flag.state}`);
    this.name = 'LaunchFlagClosed';
    this.code = flag.state;
    this.ar = flag.whyAr;
    this.flag = flag;
  }
}

/**
 * ENFORCEMENT LIVES HERE, IN THE SERVICE LAYER.
 *
 * Rule 4 of this codebase: «Enforce in the service layer. Hiding a control
 * in the UI is not enforcement. Every guard has a negative test.» So any
 * service behind a flag calls THIS — before it reads, before it writes,
 * before it talks to an ad account — and a screen that forgets to hide its
 * button produces a refusal rather than an action.
 *
 * It refuses four distinct states with four distinct codes, because
 * «switched off», «never built», «not a switch at all» and «outlived its
 * review» are four different facts, and a caller that logs them as one
 * cannot tell an operator which it is.
 */
export async function assertFlagOpen(
  companyId: string,
  key: string,
  now: Date = new Date()
): Promise<ResolvedFlag> {
  const decl = flagByKey(key);
  if (!decl) throw new Error(`launch-flags: مفتاح غير معرَّف «${key}».`);
  return assertResolvedOpen(resolveFlag(decl, await storedFor(companyId), now));
}

/**
 * The refusal itself, separated from the database read.
 *
 * Separated so the whole truth table can be driven without a company row —
 * which matters today for a reason worth writing down: THERE IS NO SWITCH
 * IN THIS REGISTRY. Every real flag is `UNBUILT` or `INVARIANT`, so the
 * `ON` and `EXPIRED` paths are unreachable through `LAUNCH_FLAGS` and would
 * otherwise ship untested — the classic shape of a guard that turns out not
 * to work the first morning somebody needs it.
 */
export function assertResolvedOpen(resolved: ResolvedFlag): ResolvedFlag {
  if (resolved.state !== 'ON') throw new LaunchFlagClosed(resolved);
  return resolved;
}

/**
 * FLIP A SWITCH — and refuse everything that is not one.
 *
 * Three refusals, each naming the failure it prevents:
 *
 *   • A KEY THAT IS NOT A SWITCH. `ads-agent` and `late-thresholds-p80`
 *     cannot be stored at all, in any value. This is the refusal that makes
 *     «absent» un-fakeable: there is no request that writes them, so there
 *     is no screen, script or curl that can produce a document in which
 *     they look enabled. The failure prevented is the launch checklist that
 *     shows a green ON beside a feature nobody wrote.
 *   • ON INSIDE THE HOLD. «all OFF for 14 days» is the one line of the
 *     brief with a date in it. An eager operator on day 3 is refused by the
 *     service, not reminded by a label.
 *   • ON AFTER THE REVIEW DATE. Turning a flag on past its own review is
 *     re-opening a gate whose owner never renewed it. Refused; the fix is a
 *     new review date in this file, which carries a name in the diff.
 *
 * Turning a flag OFF is never refused, in any state. A kill switch that can
 * be blocked by an expiry rule is not a kill switch, and the direction that
 * stops a feature should never need an argument.
 */
export async function setLaunchFlag(
  companyId: string,
  key: string,
  on: boolean,
  now: Date = new Date()
): Promise<ResolvedFlag> {
  const decl = flagByKey(key);
  if (!decl) throw new Error(`launch-flags: مفتاح غير معرَّف «${key}».`);
  assertWritable(decl, on, today(now));

  /*
   * Only this key of the document, under a row lock — the same discipline
   * `performance-settings.ts` uses, for the same reason: `Company.settings`
   * has several owners and a read-modify-write of the whole document loses
   * whatever another saver wrote in between.
   */
  const next = await updateCompanySettings<Record<string, boolean>>(companyId, SETTINGS_KEY, (current) => {
    const base = parseStoredFlags(current);
    base[key] = on;
    return base;
  });

  return resolveFlag(decl, parseStoredFlags(next), now);
}

/**
 * The three write refusals, with no database in sight.
 *
 * `day` is passed in rather than read, so «day 3 of the hold» and «the
 * morning after the review date» are ordinary test cases instead of
 * something that can only be checked by waiting.
 */
export function assertWritable(decl: FlagDecl, on: boolean, day: string): void {
  if (decl.kind !== 'SWITCH') {
    throw new LaunchFlagRefused(
      `«${decl.key}» ليس مفتاحاً يُقلَب. ${resolveFlag(decl, {}, new Date(`${day}T00:00:00.000Z`)).whyAr}`
    );
  }
  if (on && day < decl.holdUntil) {
    throw new LaunchFlagRefused(`«${decl.key}» مُجمَّد حتى ${decl.holdUntil}. لا يُشغَّل قبل ذلك اليوم.`);
  }
  if (on && day > decl.reviewOn) {
    throw new LaunchFlagRefused(
      `«${decl.key}» مرّ تاريخ مراجعته (${decl.reviewOn}). جدّد التاريخ في الكود قبل تشغيله.`
    );
  }
}

/**
 * A WRITE THE REGISTRY REFUSED — as opposed to a gate that is merely shut.
 *
 * Separate from `LaunchFlagClosed` because the two say different things to
 * different people: `Closed` tells a user «this feature is not available»,
 * `Refused` tells an operator «your flip did not happen, and here is why».
 * Routes that know about flags show `ar`; routes that do not still get a
 * 403 from the `Forbidden:` prefix rather than the generic 500 that any
 * other custom message in this codebase would collapse into.
 */
export class LaunchFlagRefused extends Error {
  readonly ar: string;
  constructor(ar: string) {
    super(`Forbidden: launch-flags refused — ${ar}`);
    this.name = 'LaunchFlagRefused';
    this.ar = ar;
  }
}
