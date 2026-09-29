import { HEALTH_AR, type HealthTone } from './health';
import { bandInfo, bandsForRole } from './performance-score';

/**
 * «خانة الموظفين: AI + Score» — AND WHY THE ANSWER IS NOT A NEW SCORE.
 *
 * The owner's note asks for a grade on the employees screen. The employees
 * screen is the one screen in this system that lists EVERY account: the
 * moderators and the confirmation desk, but also the accountant, the
 * warehouse, the settlement officer, the shipping manager, the owner
 * himself. That is the whole difficulty, and it is why this file measures
 * something the performance card does not.
 *
 * A grade for employees ALREADY EXISTS and is not rebuilt here.
 * `performance-score.ts` bands a person out of 100, `performance-metrics.
 * scoreRole` reads the numbers, `/api/performance/card` and
 * `/api/performance/team` serve it, `ScoreCard` and `ScoreBoard` draw it.
 * Writing a second arithmetic path to an employee's quality would give one
 * person two grades in one product, and the losing argument about which is
 * real would be won by whichever screen the owner opened first. So the
 * number on the employees row IS that number, fetched, never recomputed.
 *
 * WHAT DOES NOT EXIST — and what this file is for — is the answer to «why
 * is this row blank». Measured on this database, 2026-09-29:
 *
 *   19 employee accounts in 11 roles.
 *   10 of them hold a role the score has bands for; 9 hold a role it has
 *     none for, so no amount of work would ever produce a number.
 *   1 of the 19 clears the owner's own minimum sample (10) and is graded:
 *     82 out of 90, rank 1 of 4 moderators.
 *   9 of the 10 measurable people sit at a sample of 0 or 1.
 *   6 of the 19 accounts have no recorded action ANYWHERE — not an order,
 *     not a claim, not a status change, not one audit row, ever.
 *
 * So a bare score column on this screen would be blank on 18 of 19 rows.
 * Eighteen blanks teach a reader that the feature is broken. Eighteen rows
 * each saying which of five different things is true — and what would have
 * to change — is the same record, usable.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO FACTS, DELIBERATELY NOT ADDED TOGETHER
 * ─────────────────────────────────────────────────────────────────────
 *
 * QUALITY. The banded score, borrowed whole. Speaks for 1 of 19 today.
 *
 * PRESENCE. How many recorded actions this account has, over how many
 * distinct days, and how long ago the last one was. Nothing in this
 * codebase reads that: `team-performance` measures the confirmation desk's
 * throughput and only for people who claim from the pool, `my-work` counts
 * queues, and the audit log has no reader that can answer «which accounts
 * have never been used». It speaks for 13 of 19.
 *
 * They are printed side by side and NEVER summed. An account can be busy
 * and bad, or careful and slow, and a single figure mixing the two would
 * hide both — and, worse, would disagree with the performance card by
 * construction. The two bands the commission fairness measure carries are
 * weighted and summed because they are two readings of one thing, volume.
 * These are two different things, so they stay two numbers.
 *
 * AND THERE IS NO MODEL. «AI» in this note means derived and explainable.
 * Every sentence below is a template around a counted integer.
 */

// ─── THE FLOORS ───

/**
 * WHICH FLOORS ARE BORROWED, AND WHY ONLY ONE IS NEW.
 *
 * The quality floor is the owner's `performanceSettings.minSample` — the
 * same one the card and the board gate on. Inventing a second minimum for
 * this screen would mean an employee is «too thin to judge» on one screen
 * and graded on another, from the same orders.
 *
 * Whether a role can be graded at all is `bandsForRole` — also borrowed, and
 * borrowed on purpose rather than listed here: the day somebody writes bands
 * for the warehouse, this screen starts grading the warehouse without being
 * touched. A second list of measurable roles would have to be remembered.
 *
 * One floor is genuinely new, and only one is needed.
 */

/**
 * An ACTIVE account whose last recorded action is older than this is called
 * out in words.
 *
 * Two working weeks. Shorter would fire on anybody who took leave; longer
 * and a dormant account with live credentials sits unnoticed for a month.
 * MEASURED, 2026-09-29: with the record running to 2026-09-29, two of the
 * thirteen accounts that have ever acted were last seen on 2026-09-21 —
 * eight days, inside the window, correctly not flagged. Nothing in this
 * database is stale by this definition, which is the honest reading of a
 * record whose whole history is four weeks long.
 */
export const STALE_DAYS = 14;

/**
 * PRESENCE HAS NO FLOOR, AND THAT IS NOT AN OVERSIGHT.
 *
 * A floor exists to stop a RATIO being stated from too few observations.
 * Presence is not a ratio — it is a count of rows that are either there or
 * not. «Zero recorded actions» is not a small sample of an account's
 * behaviour, it is the complete record of it. So the threshold is one, it is
 * definitional, and dressing it up as a tunable `MIN_TRACE_EVENTS = 3` would
 * be inventing a judgement where there is only counting.
 */
export const MIN_TRACE_EVENTS = 1;

// ─── THE STATES ───

/**
 * WHY FIVE, AND WHY THEY ARE A DECISION TREE AND NOT A SCORE.
 *
 * Each names a DIFFERENT reason a row does or does not carry a grade, and
 * each carries a different next action for the owner. They are checked in
 * order, most informative first, and exactly one is true of any row.
 */
export const EMPLOYEE_GRADE_STATES = [
  /** No recorded action of any kind. The account itself is the finding. */
  'NO_TRACE',
  /** This role earns no band, so working harder would never produce one. */
  'ROLE_NOT_MEASURED',
  /** Suspended, disabled or still pending: not ranked against the people working. */
  'NOT_ACTIVE',
  /** Measurable role, but they do not work the store the grade is scoped to. */
  'OUTSIDE_STORE',
  /** Measurable, in the store, but under the owner's own minimum sample. */
  'THIN_SAMPLE',
  /** The score speaks. The number is the card's, not this file's. */
  'GRADED',
] as const;

export type EmployeeGradeState = (typeof EMPLOYEE_GRADE_STATES)[number];

/** Presence: the counted rows, with no arithmetic done to them. */
export interface EmployeeTrace {
  /** Recorded actions across every evidence table the route reads. */
  events: number;
  /** Distinct calendar days carrying at least one of them. */
  activeDays: number;
  /** Whole days since the last one. Null when there has never been one. */
  lastSeenDaysAgo: number | null;
}

/**
 * The quality score AS THE CARD COMPUTED IT. Null when this person was not
 * in the scored pass at all — a role with no bands, or a store they do not
 * work in. Never recomputed here, and there is no branch in this file that
 * could produce one of these fields from the others.
 */
export interface EmployeeScore {
  /** Null when the sample was under the minimum — `ScoreResult.total`. */
  total: number | null;
  /** The weights that actually applied, which the row says «من» against. */
  possible: number;
  sample: number;
  minSample: number;
  /** Within this role and this store, best first. Never across roles. */
  rank: number;
  of: number;
}

export interface EmployeeFacts {
  userId: string;
  role: string;
  /** ACTIVE, PENDING, SUSPENDED, DISABLED — a dormant DISABLED account is expected. */
  status: string;
  trace: EmployeeTrace;
  scored: EmployeeScore | null;
}

export interface EmployeeGrade {
  userId: string;
  state: EmployeeGradeState;
  tone: HealthTone;
  /** Two words for the chip. Never a number pretending to be a verdict. */
  label: string;
  /** Why it says that, with the counted numbers in it, for the line beneath. */
  why: string;
  /**
   * What the grade IS MADE OF for this role, in the band names the card
   * already prints. Empty for a role with no bands — which is itself the
   * answer, and the row says so.
   */
  madeOf: string[];
  /** Presence, said in words, for every row including the graded ones. */
  presence: string;
  /** An ACTIVE account not seen for longer than the floor. */
  stale: boolean;
  /** Passed through untouched so the row can print the card's own number. */
  scored: EmployeeScore | null;
  trace: EmployeeTrace;
}

const STATE_LABEL: Record<EmployeeGradeState, string> = {
  NO_TRACE: 'بلا أثر',
  ROLE_NOT_MEASURED: 'دورٌ بلا بنود',
  NOT_ACTIVE: 'حسابٌ غيرُ نشط',
  OUTSIDE_STORE: 'خارج هذا المتجر',
  THIN_SAMPLE: HEALTH_AR.unknown,
  GRADED: 'مقيَّم',
};

/** ACTIVE is the only status the score ranks. `performance-people` says why. */
export const GRADABLE_STATUS = 'ACTIVE';

/**
 * «مقيَّم» IS GREEN, AND IT DOES NOT MEAN «GOOD EMPLOYEE».
 *
 * It means the record can speak about this person. The score itself is
 * printed beside the chip and is NOT coloured, for the same reason
 * `ScoreCard` does not colour its total: there is no owner-set bar for a
 * composite out of ninety, and a green chip on a total of 20 out of 90
 * would be this screen inventing one. The bars the owner does set colour
 * the individual band lines on the card, where they belong.
 *
 * Only one state is red: an ACTIVE account that has never done anything.
 * That is a live credential with no work behind it, and it is the one thing
 * on this screen that is a problem rather than a gap in the record.
 */
function toneOf(state: EmployeeGradeState, status: string): HealthTone {
  if (state === 'GRADED') return 'good';
  if (state === 'NO_TRACE') return status === GRADABLE_STATUS ? 'bad' : 'unknown';
  return 'unknown';
}

/** The band names this role's grade is built from — the card's own words. */
export function madeOfFor(role: string): string[] {
  return bandsForRole(role).map((key) => bandInfo(key).ar);
}

/**
 * A COUNTED NOUN IN ARABIC IS NOT A NUMBER WITH A WORD AFTER IT.
 *
 * The rest of this codebase writes `${n} يوماً` and it is wrong for most
 * values of n: «4 يوماً» and «2 يوماً» read to an Arabic speaker the way «4
 * day» reads in English. The language has five cases and every sentence on
 * this screen is read by the owner, so they are all here:
 *
 *   1        يوم            the noun alone
 *   2        يومين          the dual — the digit is not written at all
 *   3–10     4 أيام         plural
 *   11–99    14 يوماً        singular accusative
 *   100, 0   100 يوم        singular, and zero takes the same shape
 *
 * Kept local rather than exported: a general Arabic pluraliser is a thing
 * this codebase should have once, in `format.ts`, and putting a second
 * candidate for it in a grading file is how two of them end up existing.
 * These two nouns are the two this file counts.
 */
interface CountedNoun {
  one: string;
  two: string;
  few: string;
  many: string;
  bare: string;
}

function arCount(n: number, w: CountedNoun): string {
  if (n === 1) return w.one;
  if (n === 2) return w.two;
  const mod = n % 100;
  if (n === 0 || mod === 0) return `${n} ${w.bare}`;
  if (mod >= 3 && mod <= 10) return `${n} ${w.few}`;
  return `${n} ${w.many}`;
}

const DAYS: CountedNoun = { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوماً', bare: 'يوم' };
const MOVES: CountedNoun = { one: 'حركة', two: 'حركتين', few: 'حركات', many: 'حركةً', bare: 'حركة' };

const dayWord = (n: number) => arCount(n, DAYS);

/**
 * PRESENCE, IN WORDS, ON EVERY ROW.
 *
 * Including the graded ones: a score of 82 earned across four days in one
 * month is not the same thing as 82 earned across twenty, and the card
 * cannot say which because it does not count days. The sentence carries the
 * three counts and no ratio, because a ratio here would be the fused number
 * this file exists to refuse.
 */
export function presenceOf(trace: EmployeeTrace, status: string): { text: string; stale: boolean } {
  if (trace.events < MIN_TRACE_EVENTS) {
    return { text: 'لا حركةَ مسجَّلةً لهذا الحساب في أيّ سجلّ — لا طلبٌ ولا تغييرُ حالةٍ ولا سطرُ تدقيق.', stale: false };
  }
  const ago =
    trace.lastSeenDaysAgo === null
      ? ''
      : trace.lastSeenDaysAgo <= 0
        ? '، آخرها اليوم'
        : `، آخرها قبل ${dayWord(trace.lastSeenDaysAgo)}`;
  const stale =
    status === GRADABLE_STATUS && trace.lastSeenDaysAgo !== null && trace.lastSeenDaysAgo > STALE_DAYS;
  const warn = stale ? ` — والحساب نشطٌ ولم يُستخدَم منذ أكثر من ${dayWord(STALE_DAYS)}.` : '.';
  return {
    text: `${arCount(trace.events, MOVES)} في ${dayWord(trace.activeDays)}${ago}${warn}`,
    stale,
  };
}

/**
 * ONE ROW'S VERDICT.
 *
 * Pure: counted integers in, a state and two sentences out. It reads no
 * database, opens no clock, and computes no quality — the one number that
 * could be called a grade arrives already computed in `facts.scored` and
 * leaves untouched in `grade.scored`.
 */
export function gradeEmployee(facts: EmployeeFacts): EmployeeGrade {
  const madeOf = madeOfFor(facts.role);
  const presence = presenceOf(facts.trace, facts.status);
  const base = { userId: facts.userId, madeOf, presence: presence.text, stale: presence.stale, scored: facts.scored, trace: facts.trace };
  const say = (state: EmployeeGradeState, why: string): EmployeeGrade => ({
    ...base,
    state,
    tone: toneOf(state, facts.status),
    label: STATE_LABEL[state],
    why,
  });

  // FIRST, because it outranks every other reason a row is blank. «0 من 10»
  // invites the reader to wait for the sample to grow. An account that has
  // never been used is not waiting for anything, and saying so is the more
  // useful sentence even when a thinner one is also true.
  if (facts.trace.events < MIN_TRACE_EVENTS) {
    return say(
      'NO_TRACE',
      'لا يوجد ما يُقاس: هذا الحساب لم يسجّل حركةً واحدةً بعد. ' +
        (facts.status === GRADABLE_STATUS
          ? 'وهو نشطٌ — فإمّا أنّ صاحبه لم يبدأ، أو أنّ العمل يُسجَّل باسمِ حسابٍ آخر.'
          : `وحالته «${facts.status}» — فغيابُ الحركة متوقَّع.`)
    );
  }

  // SECOND: a ceiling, not a floor. No sample would ever lift this row,
  // so telling somebody to wait would be telling them to wait for ever.
  if (madeOf.length === 0) {
    return say(
      'ROLE_NOT_MEASURED',
      'لا بندَ قياسٍ لهذا الدور بعد، فلا تقديرَ له مهما عمِل — البنودُ الموجودةُ كلُّها تقيس العملَ على الطلبات. ' +
        'وما فعله مسجَّلٌ ومقروءٌ في السطر أدناه.'
    );
  }

  // THIRD: somebody who left is not competition. `performance-people.peersOf`
  // ranks ACTIVE accounts only, and it is right to — leaving a strong month by
  // a person who is gone in the volume reference would lower everybody else's
  // band for ever. So the row says «not active», not «not in this store»,
  // which is a different and untrue reason.
  if (facts.status !== GRADABLE_STATUS) {
    return say(
      'NOT_ACTIVE',
      `حالةُ الحساب «${facts.status}» — والتقديرُ يُحسَب بين النشطين فقط، لأنّ مَن تركَ العملَ لو بقي في المقارنة ` +
        'لَخفَض نصيبَ مَن بقي إلى الأبد.'
    );
  }

  // FOURTH: the grade is scoped to one store, because a rank across stores
  // would compare two different businesses — the rule `performance-people`
  // already states. Somebody who does not work here is not «ungraded», they
  // are graded somewhere else.
  if (facts.scored === null) {
    return say(
      'OUTSIDE_STORE',
      'دورُه يُقاس، لكنّه لا يعمل في المتجر الذي يُحسَب التقديرُ فيه — فتقديرُه يُقرأ من متجره هو، لا من هنا.'
    );
  }

  if (facts.scored.total === null) {
    return say(
      'THIN_SAMPLE',
      `العيّنة ${facts.scored.sample} طلباً، والحدّ الأدنى ${facts.scored.minSample}. ` +
        'لا تقديرَ بعد — رقمٌ من عيّنةٍ بهذا الصغر يُصدَّق شهراً كاملاً. ' +
        `وما يُبنى عليه التقدير: ${madeOf.join('، ')}.`
    );
  }

  return say(
    'GRADED',
    `${facts.scored.total} من ${facts.scored.possible} عن ${facts.scored.sample} طلباً، ` +
      `والمرتبة ${facts.scored.rank} من ${facts.scored.of} في دوره وهذا المتجر. ` +
      `والبنود: ${madeOf.join('، ')}.`
  );
}

/**
 * BEST FIRST, AND «WE CANNOT TELL YET» IS NOT LAST PLACE.
 *
 * The same rule `byFairness` and `scoreRole` both keep: an ungraded person
 * placed under a measured low scorer reads as worse than them, which is a
 * verdict nobody computed. Graded rows sort by their number; the rest sort
 * by state in the declared order, so the accounts that have never been used
 * gather at the end where they can be dealt with in one pass.
 */
export function byEmployeeGrade(a: EmployeeGrade, b: EmployeeGrade): number {
  const at = a.scored?.total ?? null;
  const bt = b.scored?.total ?? null;
  if (at !== null && bt !== null) return bt - at;
  if (at !== null) return -1;
  if (bt !== null) return 1;
  const rank = (g: EmployeeGrade) => EMPLOYEE_GRADE_STATES.indexOf(g.state);
  // Declared order runs NO_TRACE first, so it is reversed here: the rows
  // nearest to being gradable come first, the empty accounts last.
  return rank(b) - rank(a);
}

export interface RosterReadiness {
  total: number;
  graded: number;
  thinSample: number;
  roleNotMeasured: number;
  notActive: number;
  outsideStore: number;
  noTrace: number;
  /** ACTIVE accounts whose last action is older than the floor. */
  stale: number;
  /** Every band name any listed role's grade is built from, once each. */
  madeOf: string[];
  /** The whole screen in one sentence, with the counts in it. */
  why: string;
}

/**
 * WHAT THE GRADE IS MADE OF, AND WHAT IS MISSING BEFORE IT CAN SPEAK.
 *
 * The two honest things a screen can say on a day when it can grade almost
 * nobody — and on this database that day is today. The strip is not a
 * consolation for an empty column: an owner who reads «6 حسابات بلا أثر»
 * has found six accounts to close or six people to train, which is worth
 * more than a score for one moderator.
 */
export function rosterReadiness(grades: readonly EmployeeGrade[]): RosterReadiness {
  const count = (s: EmployeeGradeState) => grades.filter((g) => g.state === s).length;
  const madeOf = [...new Set(grades.flatMap((g) => g.madeOf))];
  const out = {
    total: grades.length,
    graded: count('GRADED'),
    thinSample: count('THIN_SAMPLE'),
    roleNotMeasured: count('ROLE_NOT_MEASURED'),
    notActive: count('NOT_ACTIVE'),
    outsideStore: count('OUTSIDE_STORE'),
    noTrace: count('NO_TRACE'),
    stale: grades.filter((g) => g.stale).length,
    madeOf,
  };

  if (out.total === 0) return { ...out, why: 'لا موظّفَ في هذه القائمة.' };

  // Only the non-zero parts, so the sentence says what is true of THIS
  // roster rather than reciting five categories four of which are empty.
  const parts: string[] = [];
  if (out.graded) parts.push(`${out.graded} له تقدير`);
  if (out.thinSample) parts.push(`${out.thinSample} عيّنتُه تحت الحدّ`);
  if (out.notActive) parts.push(`${out.notActive} حسابُه غيرُ نشط`);
  if (out.outsideStore) parts.push(`${out.outsideStore} يعمل في متجرٍ آخر`);
  if (out.roleNotMeasured) parts.push(`${out.roleNotMeasured} في أدوارٍ لا بندَ قياسٍ لها`);
  if (out.noTrace) parts.push(`${out.noTrace} بلا حركةٍ مسجَّلةٍ قطّ`);
  const stale = out.stale ? ` و${out.stale} حساباً نشطاً لم يُستخدَم منذ أكثر من ${dayWord(STALE_DAYS)}.` : '';

  return {
    ...out,
    why: `من ${out.total} موظفاً: ${parts.join('، ')}.${stale}`,
  };
}
