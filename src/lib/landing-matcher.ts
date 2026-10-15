import { LANDING_STRUCTURES } from './landing-structures';
import type { LandingStructure } from './landing-structure';

/**
 * THE MATCHER — «اقتراح لكل منتج»: a structure, a family, and WHY, for one
 * product.
 *
 * The brief's words (S3 / O3 · 2c): «`landing_copy` grows `structure ·
 * structureWhy · family · familyWhy` beside `copy`. Inputs: name,
 * description, category, category attributes (need · skin · ml · made ·
 * ingredients), basePrice, live offers — nothing else.»
 *
 * Three decisions are written down here rather than in the door, because
 * each of them is the kind that gets quietly reversed in a route:
 *
 *   THE MODEL NAMES AN ID, AND THE ID IS LOOKED UP HERE. A proposal that
 *   could carry a structure's SLOTS would be a prompt somebody else wrote
 *   running under this shop's key — `landing-copy-brief.ts` made the same
 *   call for the same reason. So what comes back is an id, and an id that
 *   is not in `LANDING_STRUCTURES` or in `LANDING_FAMILIES` is DROPPED AND
 *   NAMED. Not corrected to the nearest one: a silent correction is the
 *   model choosing something nobody can audit.
 *
 *   NO NUMBER OF OURS IS IN THE BRIEF. `viewsCount` and `ordersCount` are
 *   this shop's own results, and the owner's rule is that they never reach
 *   a model. They are not «left out of the prompt» — they are not
 *   parameters of `matcherBrief` at all, so there is no version of this
 *   file in which somebody adds them to a string by accident. The counted
 *   half lives in `countedCombinations`, which never builds a prompt.
 *
 *   AND IT IS A PROPOSAL. Nothing here writes; the door returns it and the
 *   owner presses. `ai-proposal-only.test.ts` holds that repo-wide.
 */

/**
 * THE FOUR FAMILIES, as the owner named them.
 *
 * «عيادة» (problem-solving / medical-feeling) · «عطّار» (natural, herbal,
 * heritage) · «ترند» (beauty, impulse) — the three of D3 — and «علامة»,
 * the fourth the owner added on 15/10 (`S1-FAMILY-4-ALAMA.md`): a product
 * with a world of its own, built from its fields with no designer.
 *
 * ⚠️ WHY THE LIST IS HERE AND NOT IN THE STOREFRONT'S OWN MODULE. The
 * families are being built on their own branch (`2a-2`), and the matcher
 * must not wait for it: what the matcher needs of a family is its ID and
 * one line about who it is for — the typography, header and card are the
 * storefront's business and none of this file's. When that branch lands,
 * its renderer reads these ids; two lists of the same four would be two
 * lists to keep in step, so the ids are the contract and they are chosen
 * to be the ones a renderer would choose.
 */
export const LANDING_FAMILIES = [
  {
    id: 'clinic',
    name: 'عيادة',
    forWhom: 'منتج بيحلّ مشكلة — الزائر عنده شكوى وبيدوّر على حلّ',
  },
  {
    id: 'herbal',
    name: 'عطّار',
    forWhom: 'منتج طبيعي أو تراثي — القصّة أصله ومكوّناته',
  },
  {
    id: 'trend',
    name: 'ترند',
    forWhom: 'منتج جمال أو شراء لحظي — الشكل والسرعة بيبيعوا',
  },
  {
    id: 'brand',
    name: 'علامة',
    forWhom: 'منتج بعالم خاص — اسم لاتيني وصورة وألوان بتطلع من صورته',
  },
] as const;

export type LandingFamilyId = (typeof LANDING_FAMILIES)[number]['id'];

export const familyById = (id: string) => LANDING_FAMILIES.find((f) => f.id === id);

/**
 * THE FIVE ATTRIBUTES THE BRIEF MAY CARRY, BY NAME.
 *
 * The brief names them: «category attributes (need · skin · ml · made ·
 * ingredients)». A category's questions are the seller's own JSON and a
 * shop may have twelve of them, so passing «the attributes» would mean
 * passing whatever a seller happened to add — which is how a field nobody
 * reviewed ends up in a prompt.
 *
 * The keys are matched case-insensitively against the category's declared
 * keys (`product-attributes.ts` forces them lowercase latin anyway), and
 * anything else is left behind. A shop that answers none of the five sends
 * none: the brief says so rather than inventing.
 */
export const BRIEF_ATTRIBUTE_KEYS = ['need', 'skin', 'ml', 'made', 'ingredients'] as const;

/**
 * THE FIVE, READ OUT OF THE CATEGORY'S OWN QUESTIONS.
 *
 * A category's questions are the seller's JSON and a product's answers are
 * read against them (`product-attributes.ts`), so this does not re-parse
 * either: it takes what those two already produced and keeps the five.
 *
 * Two maps come back because two readers need different halves. `byKey`
 * is what `landing-build.ts` looks a written spec up in — `attr:ml` is a
 * KEY, and a label would make the lookup depend on how a seller spelled
 * «الحجم». `labelled` is what goes in the brief, because «ml: 150» tells a
 * model less than «الحجم: 150».
 */
export function fiveAttributes(
  fields: readonly { key: string; label: string }[],
  answers: Readonly<Record<string, unknown>>
): { byKey: Record<string, string>; labelled: Record<string, string> } {
  const byKey: Record<string, string> = {};
  const labelled: Record<string, string> = {};
  for (const field of fields) {
    if (!(BRIEF_ATTRIBUTE_KEYS as readonly string[]).includes(field.key.toLowerCase())) continue;
    const answer = answers[field.key];
    const value = Array.isArray(answer) ? answer.join(' · ') : answer;
    if (value === undefined || value === null) continue;
    const written = String(value).trim();
    if (written === '') continue;
    byKey[field.key.toLowerCase()] = written;
    labelled[field.label] = written;
  }
  return { byKey, labelled };
}

/** One live offer, as the brief says it. No ids, no internal columns. */
export interface BriefOffer {
  /** What the seller called it — «قطعتين بسعر واحدة». */
  name: string;
  /** How many units, and what the customer pays for them. */
  quantity: number;
  price: number;
}

export interface MatcherInput {
  name: string;
  description?: string | null;
  /** The category's own name, not its id. */
  category?: string | null;
  /** Only the five keys above, already filtered, label → answer. */
  attributes?: Readonly<Record<string, string>>;
  price: number;
  currency: string;
  offers?: readonly BriefOffer[];
  /** How many proposals to ask for. Three, as the brief says. */
  picks?: number;
}

/** Three, and the number is the brief's: «three pre-selected choices». */
export const MATCHER_PICKS = 3;

/** The longest a reason may be. One line, because it is read in a chip. */
export const WHY_MAX = 120;

/**
 * THE BRIEF, BUILT FROM THE LISTS AT CALL TIME.
 *
 * Every structure's own `forWhom`, `temperature` and `length` go in, which
 * is the same discipline `landingCopyBrief` uses for slots: the structure
 * describes itself, so a structure added to the library is in the brief the
 * same day. A stored prompt would describe last month's ten.
 */
export function matcherBrief(input: MatcherInput): string {
  const picks = Math.max(1, Math.min(MATCHER_PICKS, input.picks ?? MATCHER_PICKS));
  const attrs = Object.entries(input.attributes ?? {}).filter(([, v]) => String(v ?? '').trim() !== '');

  return [
    'اختر لهذا المنتج أفضل بنية صفحة هبوط، وأفضل عائلة شكل، ومعهما سببٌ بسطر لكلّ اختيار.',
    '',
    '## المنتج',
    `- الاسم: ${input.name}`,
    input.description?.trim()
      ? `- وصفه كما كتبه البائع: ${input.description.trim()}`
      : '- لا وصف مكتوب له. لا تخترع له واحداً؛ اعتمد على اسمه وفئته.',
    input.category?.trim() ? `- الفئة: ${input.category.trim()}` : '- لا فئة محدّدة له.',
    `- سعره: ${input.price} ${input.currency}`,
    ...attrs.map(([k, v]) => `- ${k}: ${v}`),
    ...(input.offers && input.offers.length > 0
      ? input.offers.map((o) => `- عرض قائم: ${o.name} — ${o.quantity} بـ${o.price} ${input.currency}`)
      : ['- لا عرض قائم عليه الآن.']),
    '',
    '## البنى المتاحة — ولا شيء غيرها',
    ...LANDING_STRUCTURES.map(
      (s) => `- ${s.id} · «${s.name}» — ${s.forWhom} (زائر: ${s.temperature} · الطول: ${s.length})`
    ),
    '',
    '## العائلات المتاحة — ولا شيء غيرها',
    ...LANDING_FAMILIES.map((f) => `- ${f.id} · «${f.name}» — ${f.forWhom}`),
    '',
    '## القواعد',
    '1. المعرّفات من القائمتين أعلاه حرفياً. معرّف من عندك يُهمَل كلّه.',
    '2. لا تخترع رقماً: لا نسبة تحويل ولا عدد مشترين ولا «الأكثر نجاحاً». الأرقام ليست معك.',
    '3. لا وعد طبّي ولا ذكر مرض.',
    `4. السبب سطرٌ واحد بالعربية، لا يتجاوز ${WHY_MAX} حرفاً، ويقول «لماذا هذا المنتج» لا «ما هي هذه البنية».`,
    '5. لا لون ولا خطّ ولا مقاس — الألوان تُحسب من صورة المنتج بالكود، وليست لك.',
    '',
    '## شكل الجواب',
    'أجب بكائن JSON واحد ولا شيء غيره:',
    `{ "picks": [ { "structure": "…", "structureWhy": "…", "family": "…", "familyWhy": "…" } ] }`,
    `عدد الاقتراحات: ${picks}، الأفضل أوّلاً.`,
  ].join('\n');
}

export interface MatchPick {
  structure: LandingStructure;
  structureWhy: string;
  family: (typeof LANDING_FAMILIES)[number];
  familyWhy: string;
}

export interface MatchReading {
  picks: MatchPick[];
  /** Everything refused, in Arabic, with what was wrong with it. */
  dropped: string[];
}

const oneLine = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, WHY_MAX) : '';

/**
 * READ WHAT CAME BACK, AGAINST THE TWO LISTS.
 *
 * The refusals are deliberate and each one is a thing a model does:
 *
 *   A STRUCTURE OR FAMILY NOT ON THE LIST — dropped, named. The commonest
 *   real answer is a plausible invention («problem-first»), and accepting
 *   it would store a page shape nothing can draw.
 *
 *   A MISSING REASON — dropped, named. The reason is not decoration: it is
 *   the whole of «الاقتراح بيختار، ومعه سبب بسطر». A pick with no reason
 *   is a choice the owner cannot argue with, and the screen would have to
 *   invent a sentence to fill the chip.
 *
 *   THE SAME PAIR TWICE — the second dropped. Three identical choices are
 *   one choice wearing three buttons.
 */
export function readMatchProposal(raw: unknown): MatchReading {
  const reading: MatchReading = { picks: [], dropped: [] };
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(root.picks) ? root.picks : Array.isArray(raw) ? (raw as unknown[]) : [];

  if (list.length === 0) {
    reading.dropped.push('لا اقتراح واحد في الجواب — لا مفتاح «picks» ولا قائمة.');
    return reading;
  }

  const seen = new Set<string>();
  for (const [i, row] of list.entries()) {
    const at = `الاقتراح ${i + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      reading.dropped.push(`${at}: ليس كائناً.`);
      continue;
    }
    const r = row as Record<string, unknown>;
    const structureId = typeof r.structure === 'string' ? r.structure.trim() : '';
    const familyId = typeof r.family === 'string' ? r.family.trim() : '';
    const structure = LANDING_STRUCTURES.find((s) => s.id === structureId);
    const family = familyById(familyId);

    if (!structure) {
      reading.dropped.push(`${at}: بنية غير معروفة «${structureId || '—'}» — أُهمل.`);
      continue;
    }
    if (!family) {
      reading.dropped.push(`${at}: عائلة غير معروفة «${familyId || '—'}» — أُهمل.`);
      continue;
    }

    const structureWhy = oneLine(r.structureWhy);
    const familyWhy = oneLine(r.familyWhy);
    if (!structureWhy || !familyWhy) {
      reading.dropped.push(`${at}: بلا سبب مكتوب — والاقتراح بلا سبب لا يُعرض.`);
      continue;
    }

    const pair = `${structure.id}|${family.id}`;
    if (seen.has(pair)) {
      reading.dropped.push(`${at}: مكرّر — «${structure.name}» مع «${family.name}» معروضة فوقه.`);
      continue;
    }
    seen.add(pair);
    reading.picks.push({ structure, structureWhy, family, familyWhy });
    if (reading.picks.length >= MATCHER_PICKS) break;
  }

  return reading;
}

/** What happened, in one line above the three cards. */
export function matchNoteAr(reading: MatchReading): string {
  const parts = [`${reading.picks.length} اقتراح جاهز — والأوّل مختار، وكلّه بينغيّر.`];
  if (reading.dropped.length > 0) parts.push(`أُهمل: ${reading.dropped.join(' · ')}`);
  return parts.join(' ');
}

/*
 * ═══════════════════════════════════════════════════════════════════════
 * THE COUNTED HALF — and it never meets a model.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * «Beside it, counted results per structure × family from
 * viewsCount/ordersCount with a floor of 200 views and 5 pages per
 * combination — below it «لسا ما في أرقام كافية». The counts are never
 * sent to the model.»
 *
 * The floor is the whole honesty of it. One page with 30 views and 2
 * orders is a 6.7% conversion rate and means nothing at all; printed
 * beside a proposal it would decide the owner's choice. So a combination
 * speaks only when it has BOTH enough traffic and enough pages behind it,
 * and until then the screen says it has nothing to say.
 */

export const COUNTED_FLOOR = Object.freeze({ views: 200, pages: 5 });

/**
 * ⚠️ AND WHY THE SHOP'S OWN ROWS CANNOT FILL IT YET — SAID ON THE SCREEN.
 *
 * `landing_pages` records `viewsCount` and `ordersCount`, and it records
 * NEITHER the structure a page was built from NOR the family it wears:
 * `structureToSections` turns a structure into ordinary sections and the
 * id is not kept, and families are a look that lands with 2a-2. So «per
 * structure × family» is not a query anybody can write against this
 * schema — it needs two columns, and two columns need a migration, and
 * this task's own constraint is «No migration expected. If one is needed:
 * STOP and report before writing it.»
 *
 * The engine above is therefore built, tested and fed nothing, and the
 * screen says this sentence instead of printing a zero. A rate computed
 * from no rows would be «0%» beside every combination — a number that is
 * not true, which is the one thing this product refuses to print.
 */
export const COUNTED_NOT_RECORDED =
  'الصفحات ما بتسجّل البنية ولا العائلة بعمود، فما نقدر نقيس تركيبة من أرقامك — بدّها عمودين جدداً (هجرة) وهاد موقوف لحتى يوافق المالك.';

/** One page's own two numbers, with the pair it was wearing. */
export interface CountedPage {
  structure: string;
  family: string;
  views: number;
  orders: number;
}

export interface CountedCombination {
  structure: string;
  family: string;
  /** The names a person reads, when both ids are known here. */
  structureName: string;
  familyName: string;
  pages: number;
  views: number;
  orders: number;
  /** Orders ÷ views, as a percentage with one decimal. */
  conversion: number;
}

export interface CountedReading {
  /** Only the combinations that cleared the floor, best first. */
  ready: CountedCombination[];
  /** How many combinations had numbers but not enough of them. */
  thin: number;
  /** The sentence beside the proposals. Never a number that is not earned. */
  note: string;
}

/**
 * GROUP, THEN REFUSE WHAT HAS NOT EARNED ITS PLACE.
 *
 * Pure, and fed rows rather than reading the database, for the same reason
 * `scanForAiWrites` is pure: a floor nobody has watched REFUSE a row is a
 * floor that stops being a floor the first time somebody raises the limit
 * «just for the demo».
 */
export function countedCombinations(rows: readonly CountedPage[]): CountedReading {
  const groups = new Map<string, CountedCombination>();
  for (const row of rows) {
    const key = `${row.structure}|${row.family}`;
    const found = groups.get(key);
    if (found) {
      found.pages += 1;
      found.views += Math.max(0, row.views);
      found.orders += Math.max(0, row.orders);
      continue;
    }
    groups.set(key, {
      structure: row.structure,
      family: row.family,
      structureName: LANDING_STRUCTURES.find((s) => s.id === row.structure)?.name ?? row.structure,
      familyName: familyById(row.family)?.name ?? row.family,
      pages: 1,
      views: Math.max(0, row.views),
      orders: Math.max(0, row.orders),
      conversion: 0,
    });
  }

  const all = [...groups.values()];
  const ready = all
    .filter((c) => c.views >= COUNTED_FLOOR.views && c.pages >= COUNTED_FLOOR.pages)
    .map((c) => ({ ...c, conversion: Math.round((c.orders / c.views) * 1000) / 10 }))
    .sort((a, b) => b.conversion - a.conversion || b.views - a.views);

  const thin = all.length - ready.length;
  return {
    ready,
    thin,
    note:
      ready.length > 0
        ? `أرقامك: ${ready.length} تركيبة عندها ما يكفي (${COUNTED_FLOOR.views} مشاهدة و${COUNTED_FLOOR.pages} صفحات على الأقل).`
        : 'لسا ما في أرقام كافية.',
  };
}
