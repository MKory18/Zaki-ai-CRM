import { parseStoreSkin, type StoreSkin } from './store-skin';

/**
 * THE TEMPLATES THIS PLATFORM SHIPS.
 *
 * Ten skins over one engine. Each is data — a `StoreSkin` and nothing
 * else — and every one of them goes through `storeSkinSchema` before it
 * ships: the contrast on seven text pairs, the open-licence Arabic
 * faces, the two-family limit, one quiet entrance that does not repeat,
 * home sections that are the block library's own types, and a
 * distinctive feature the engine can actually serve.
 *
 * SO A TEMPLATE CANNOT PROMISE WHAT THE SHOP CANNOT DO. That is the
 * whole reason the contract was built first: «الميزة قدرة بالمحرّك، مش
 * كود بالقالب», and a template naming a capability nothing serves is a
 * page nobody can render.
 *
 * NO TWO SHARE A HEADER, A HERO AND A CARD ALL THREE. «ما في قالبين
 * بيتشاركوا نفس الترويسة ونفس البطل ونفس بطاقة المنتج معاً» — otherwise
 * a seller who tries two of them learns the feature is decoration. The
 * guard is in store-templates.test.ts and it reads this list.
 *
 * THREE FIRST. The brief says «ابنِ ثلاثة كتجربة، سلّمهم، بعدين السبعة
 * الباقية», and the reason is sound: three is enough to find out whether
 * one engine really wears ten skins, and cheap enough to be wrong about.
 */

/**
 * Written as plain data and parsed, never cast.
 *
 * A `StoreSkin` literal that TypeScript accepts is not a skin the
 * CONTRACT accepts — the contrast rule, the font licence and the
 * served-feature rule are all runtime. Casting would ship a template
 * that no shop can install and nobody would find out until a seller
 * tried.
 */
function shipped(raw: unknown): StoreSkin {
  const parsed = parseStoreSkin(raw);
  if (!parsed.ok) {
    throw new Error(
      `قالب لا يجتاز العقد: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join(' · ')}`
    );
  }
  return parsed.skin;
}

/**
 * ١. مختبر — a modern pharmacy.
 *
 * Clinical white, a sky blue that is calm rather than medical-alarming,
 * and near-black text. The way in is the CATEGORY'S OWN QUESTION: a
 * shopper with a complaint does not know which product answers it, and
 * «تسوّق حسب المشكلة» asks them the only thing they do know.
 */
const lab = shipped({
  id: 'lab',
  name: 'مختبر',
  suggestedFor: 'الصحة والعناية الطبية',
  version: 1,
  mood: 'clean',
  palette: {
    accent: '#0d6ba8',
    surface0: '#ffffff',
    surface1: '#ffffff',
    textPrimary: '#16202b',
    textSecondary: '#5a6876',
    border: '#dde5ec',
    price: '#16202b',
  },
  type: { heading: 'ibm', body: 'ibm' },
  shape: { corners: 'soft', borders: 'hairline', shadow: 'none' },
  layout: {
    header: 'searchFirst',
    hero: 'productFirst',
    categoryNav: 'chips',
    productCard: 'portrait',
    categoryPage: 'grid3',
    productPage: 'gallerySide',
    cart: 'page',
  },
  home: ['announcement', 'hero', 'catalog', 'trust', 'faq'],
  imagery: {
    lighting: 'bright',
    background: 'white',
    ratio: '1:1',
    forbid: ['خلفيات مزدحمة', 'ظلال قاسية', 'أيدي تمسك المنتج'],
  },
  motion: { entrance: 'fade', ms: 160, repeat: false },
  feature: 'shopByNeed',
});

/**
 * ٢. أعشاب — the herbalist's shop.
 *
 * Warm cream and olive, ink brown for the words. The distinctive thing
 * is the INGREDIENT: somebody buying herbs is buying what is in them,
 * and `ingredientLens` narrows the shelf by the category's «المكوّنات»
 * question rather than by a name they may not know.
 */
const herbs = shipped({
  id: 'herbs',
  name: 'أعشاب',
  suggestedFor: 'الأعشاب والزيوت الطبيعية',
  version: 1,
  mood: 'warm',
  palette: {
    accent: '#5a6b2f',
    surface0: '#fbf7ef',
    surface1: '#ffffff',
    textPrimary: '#3a2f25',
    textSecondary: '#6d5f52',
    border: '#e6ddcd',
    price: '#3a2f25',
  },
  // Naskh for the name, a plain face for everything else: a herbalist's
  // shop reads as one, and a display face on body text is a shop nobody
  // can read a paragraph of.
  type: { heading: 'naskh', body: 'tajawal' },
  shape: { corners: 'soft', borders: 'none', shadow: 'soft' },
  layout: {
    header: 'stacked',
    hero: 'editorial',
    categoryNav: 'tiles',
    productCard: 'square',
    categoryPage: 'grid2',
    productPage: 'galleryTop',
    cart: 'page',
  },
  home: ['hero', 'text', 'catalog', 'benefits', 'reviews'],
  imagery: {
    lighting: 'natural',
    background: 'neutral',
    ratio: '4:5',
    forbid: ['خلفيات بيضاء صرفة', 'إضاءة استوديو باردة'],
  },
  motion: { entrance: 'fade', ms: 200, repeat: false },
  feature: 'ingredientLens',
});

/**
 * ٣. لؤلؤ — the beauty salon.
 *
 * Soft pink on pearl, with a deeper pink reserved for the thing to
 * press. The header sits over the hero rather than above it, and the
 * hero turns by hand through three slides — nothing moves on its own,
 * which the contract enforces anyway.
 *
 * ITS INTENDED FEATURE IS «ابنِ روتينك» — three products at a recorded
 * discount — and the engine cannot do that yet: an offer belongs to one
 * product, and a bundle across three is not a thing this system has.
 * So the template claims what it can serve, and the note says the rest.
 * A template that named the routine builder would be a page nobody can
 * render.
 */
const pearl = shipped({
  id: 'pearl',
  name: 'لؤلؤ',
  suggestedFor: 'التجميل والعناية بالبشرة',
  version: 1,
  mood: 'calm',
  palette: {
    accent: '#b4326d',
    surface0: '#fdf7f9',
    surface1: '#ffffff',
    textPrimary: '#2e2229',
    textSecondary: '#6a5b64',
    border: '#f0dfe6',
    price: '#2e2229',
    offerBadge: '#b4326d',
  },
  type: { heading: 'messiri', body: 'readex' },
  shape: { corners: 'soft', borders: 'none', shadow: 'lifted' },
  layout: {
    header: 'transparent',
    hero: 'slider',
    categoryNav: 'tiles',
    productCard: 'portrait',
    categoryPage: 'grid2',
    productPage: 'sticky',
    cart: 'drawer',
  },
  home: ['hero', 'catalog', 'gallery', 'reviews', 'faq'],
  imagery: {
    lighting: 'bright',
    background: 'colour',
    ratio: '4:5',
    forbid: ['خلفيات داكنة', 'ظلال قاسية على البشرة'],
  },
  motion: { entrance: 'rise', ms: 220, repeat: false },
  feature: 'quickAdd',
});


/**
 * ٤. طقوس — the wellness magazine.
 *
 * Warm beige and stone with ONE orange, kept for the thing to press.
 * The first screen is a headline with a product in it, because this shop
 * sells a habit rather than an object and the words are what carry it.
 *
 * ITS INTENDED FEATURE IS «قصص قابلة للتسوّق» — a short article with
 * products embedded in it — which the engine cannot do: a block that
 * holds prose AND live products does not exist. It puts forward the
 * delivery estimate instead, which a supplement buyer on a monthly
 * habit genuinely wants, and the story block waits.
 */
const ritual = shipped({
  id: 'ritual',
  name: 'طقوس',
  suggestedFor: 'المكمّلات والعافية',
  version: 1,
  mood: 'warm',
  palette: {
    accent: '#b4530f',
    surface0: '#faf6f0',
    surface1: '#ffffff',
    textPrimary: '#2f2a24',
    textSecondary: '#6b6158',
    border: '#e8ded0',
    price: '#2f2a24',
  },
  type: { heading: 'messiri', body: 'tajawal' },
  shape: { corners: 'soft', borders: 'none', shadow: 'none' },
  layout: {
    header: 'minimal',
    hero: 'editorial',
    categoryNav: 'chips',
    productCard: 'wide',
    categoryPage: 'list',
    productPage: 'galleryTop',
    cart: 'page',
  },
  home: ['hero', 'text', 'catalog', 'benefits', 'faq'],
  imagery: {
    lighting: 'natural',
    background: 'scene',
    ratio: '16:9',
    forbid: ['خلفيات بيضاء صرفة', 'منتج معزول بلا سياق'],
  },
  motion: { entrance: 'fade', ms: 220, repeat: false },
  feature: 'deliveryEstimate',
});

/**
 * ٥. عنبر — the luxury boutique.
 *
 * A DARK SHOP, and that is the one place the contrast rule earns its
 * keep: ivory on near-black reads, and the gold has to be deep enough to
 * carry its own text. A paler gold failed the button pair outright,
 * which is exactly the sort of thing a designer ships and a customer
 * squints at in daylight.
 *
 * «خيار الهدية» is its intended feature — wrapping and a card as a line
 * on the order — and nothing serves that, so it puts forward the one
 * thing a boutique's customer actually does: ask.
 */
const amber = shipped({
  id: 'amber',
  name: 'عنبر',
  suggestedFor: 'العطور والعود والفاخر',
  version: 1,
  mood: 'bold',
  palette: {
    accent: '#7d5f23',
    surface0: '#10172b',
    surface1: '#18213a',
    surface2: '#1f2944',
    textPrimary: '#f2e9d8',
    textSecondary: '#b9ab91',
    border: '#2c3752',
    price: '#f2e9d8',
    priceCompare: '#b9ab91',
  },
  type: { heading: 'aref', body: 'almarai' },
  shape: { corners: 'sharp', borders: 'hairline', shadow: 'none' },
  layout: {
    header: 'stacked',
    hero: 'productFirst',
    categoryNav: 'dropdown',
    productCard: 'square',
    categoryPage: 'grid2',
    productPage: 'gallerySide',
    cart: 'drawer',
  },
  home: ['hero', 'catalog', 'text', 'reviews'],
  imagery: {
    lighting: 'moody',
    background: 'colour',
    ratio: '1:1',
    forbid: ['خلفيات بيضاء', 'إضاءة مسطّحة', 'ظلال فوضوية'],
  },
  motion: { entrance: 'fade', ms: 260, repeat: false },
  feature: 'whatsappAsk',
});

/**
 * ٦. نقاء — the appliance shop.
 *
 * Clean white, near-black text, cobalt for the actions. The card is the
 * dense one because somebody buying a kettle compares three numbers, and
 * the way in is the category's own specification questions.
 *
 * «قارن المنتجات» — three side by side in a table — is what it wants and
 * nothing serves it. The specification filter is the nearest thing the
 * engine really has, and it answers most of the same question.
 */
const pure = shipped({
  id: 'pure',
  name: 'نقاء',
  suggestedFor: 'الأجهزة المنزلية والإلكترونيات',
  version: 1,
  mood: 'clean',
  palette: {
    accent: '#1c3fb8',
    surface0: '#ffffff',
    surface1: '#ffffff',
    textPrimary: '#14161a',
    textSecondary: '#5c626b',
    border: '#e2e5ea',
    price: '#14161a',
  },
  type: { heading: 'alexandria', body: 'ibm' },
  shape: { corners: 'sharp', borders: 'hairline', shadow: 'none' },
  layout: {
    header: 'searchFirst',
    hero: 'categoryTiles',
    categoryNav: 'sidebar',
    productCard: 'compact',
    categoryPage: 'grid3',
    productPage: 'sticky',
    cart: 'drawer',
  },
  home: ['announcement', 'hero', 'catalog', 'trust', 'faq'],
  imagery: {
    lighting: 'studio',
    background: 'white',
    ratio: '1:1',
    forbid: ['خلفيات ملوّنة', 'زوايا مائلة', 'انعكاسات قوية'],
  },
  motion: { entrance: 'fade', ms: 140, repeat: false },
  feature: 'sizeHelper',
});

/**
 * ٧. تراث — the old market.
 *
 * Sand and clay with a deep indigo. The first screen is the story of
 * where a thing came from, which is the whole reason somebody buys a
 * handmade one.
 *
 * «صفحات المنشأ» is its intended feature, and the engine already has
 * the shape of it: origin is a category question, and narrowing by it
 * is the same capability the pharmacy uses for a complaint. What is
 * missing is a page per origin, not the filtering.
 */
const heritage = shipped({
  id: 'heritage',
  name: 'تراث',
  suggestedFor: 'المنتجات التقليدية والحرفية',
  version: 1,
  mood: 'warm',
  palette: {
    accent: '#2b3f7d',
    surface0: '#f7f1e6',
    surface1: '#fffdf8',
    textPrimary: '#33291e',
    textSecondary: '#6f6150',
    border: '#e3d6bf',
    price: '#33291e',
  },
  type: { heading: 'amiri', body: 'tajawal' },
  shape: { corners: 'soft', borders: 'solid', shadow: 'none' },
  layout: {
    header: 'minimal',
    hero: 'editorial',
    categoryNav: 'tiles',
    productCard: 'portrait',
    categoryPage: 'mixed',
    productPage: 'galleryTop',
    cart: 'page',
  },
  home: ['hero', 'text', 'catalog', 'gallery', 'reviews'],
  imagery: {
    lighting: 'natural',
    background: 'scene',
    ratio: '4:5',
    forbid: ['خلفيات بيضاء صرفة', 'إضاءة استوديو'],
  },
  motion: { entrance: 'fade', ms: 240, repeat: false },
  feature: 'shopByNeed',
});

/**
 * ٨. نبض — the energy shop.
 *
 * Saturated blocks on broken white, strong contrast throughout. The
 * numbered best-seller list is its feature and it is a real one: from
 * delivered orders, above the sample floor, or the section is not drawn
 * at all.
 */
const pulse = shipped({
  id: 'pulse',
  name: 'نبض',
  suggestedFor: 'الرياضة والجمهور الشاب',
  version: 1,
  mood: 'bold',
  palette: {
    accent: '#c2255c',
    surface0: '#fbfbf9',
    surface1: '#ffffff',
    textPrimary: '#12131a',
    textSecondary: '#55596b',
    border: '#e4e5ea',
    price: '#12131a',
    offerBadge: '#1864ab',
  },
  // Changa for the shout, Readex for everything somebody reads. Rubik
  // was the first choice and the contract refused it: no Arabic coverage,
  // so every word of this shop would have fallen through to the system
  // stack — on the one script it is written in.
  type: { heading: 'changa', body: 'readex' },
  shape: { corners: 'sharp', borders: 'none', shadow: 'lifted' },
  layout: {
    header: 'split',
    hero: 'offerStrip',
    categoryNav: 'tiles',
    productCard: 'compact',
    categoryPage: 'grid3',
    productPage: 'galleryTop',
    cart: 'drawer',
  },
  home: ['announcement', 'hero', 'offers', 'catalog', 'reviews'],
  imagery: {
    lighting: 'bright',
    background: 'colour',
    ratio: '1:1',
    forbid: ['خلفيات باهتة', 'إضاءة ضعيفة'],
  },
  motion: { entrance: 'rise', ms: 180, repeat: false },
  feature: 'bestSellersRank',
});

/**
 * ٩. حنان — the family home.
 *
 * Mint and cream with a soft coral — and the coral is PALE on purpose,
 * which means its button carries dark text rather than white. The
 * contrast rule decided that, not a preference: a soft coral cannot hold
 * white text at 4.5, and a shop for tired parents reading on a phone at
 * night is the last place to lose that argument.
 */
const tender = shipped({
  id: 'tender',
  name: 'حنان',
  suggestedFor: 'الأم والطفل والبيت',
  version: 1,
  mood: 'calm',
  palette: {
    accent: '#e8938c',
    surface0: '#f4faf7',
    surface1: '#ffffff',
    textPrimary: '#24312c',
    textSecondary: '#5e6b65',
    border: '#dcebe3',
    price: '#24312c',
  },
  type: { heading: 'baloo', body: 'tajawal' },
  shape: { corners: 'soft', borders: 'none', shadow: 'soft' },
  layout: {
    header: 'minimal',
    hero: 'productFirst',
    categoryNav: 'tiles',
    productCard: 'portrait',
    categoryPage: 'grid2',
    productPage: 'galleryTop',
    cart: 'page',
  },
  home: ['hero', 'catalog', 'benefits', 'trust', 'faq'],
  imagery: {
    lighting: 'bright',
    background: 'scene',
    ratio: '4:5',
    forbid: ['إضاءة قاسية', 'خلفيات داكنة'],
  },
  motion: { entrance: 'fade', ms: 200, repeat: false },
  feature: 'shopByNeed',
});

/**
 * ١٠. سوق — the offers shop.
 *
 * A light base, a strong offer colour kept apart from the danger red,
 * and a price colour that carries. For a shop with more products than a
 * shopper will scroll: a wide search, a horizontal category strip, and
 * the dense card two to a row on a phone.
 *
 * «عروض اليوم» is its feature and both halves are real now — an offer
 * that ENDS, and a stock figure from the ledger. Neither can be
 * invented: the countdown reads the offer's own `endsAt`, and the
 * remaining count is the one the warehouse holds.
 */
const souq = shipped({
  id: 'souq',
  name: 'سوق',
  suggestedFor: 'المتاجر الكبيرة كثيرة المنتجات والعروض',
  version: 1,
  mood: 'clean',
  palette: {
    accent: '#0b6e7d',
    surface0: '#f7f9fa',
    surface1: '#ffffff',
    textPrimary: '#161d21',
    textSecondary: '#586870',
    border: '#dde6e9',
    price: '#161d21',
    offerBadge: '#b5361a',
  },
  type: { heading: 'cairo', body: 'cairo' },
  shape: { corners: 'soft', borders: 'hairline', shadow: 'none' },
  layout: {
    header: 'searchFirst',
    hero: 'offerStrip',
    categoryNav: 'sidebar',
    productCard: 'compact',
    categoryPage: 'grid3',
    productPage: 'galleryTop',
    cart: 'drawer',
  },
  home: ['announcement', 'hero', 'offers', 'catalog', 'urgency'],
  imagery: {
    lighting: 'bright',
    background: 'white',
    ratio: '1:1',
    forbid: ['خلفيات مزدحمة', 'نصّ محروق على الصورة'],
  },
  motion: { entrance: 'fade', ms: 150, repeat: false },
  feature: 'stockNote',
});

/**
 * The ten, in the order a seller meets them.
 *
 * Three were built first and looked at before the rest — the brief's own
 * sequencing, and it earned its keep: «عنبر» was the first dark shop and
 * the first to fail the contract, on a gold too pale to carry its own
 * button text.
 */
export const STORE_TEMPLATES: StoreSkin[] = [
  lab,
  herbs,
  pearl,
  ritual,
  amber,
  pure,
  heritage,
  pulse,
  tender,
  souq,
];

/** How many were planned. Kept beside the list so a short one is visible. */
export const TEMPLATES_PLANNED = 10;

export function templateById(id: string): StoreSkin | null {
  return STORE_TEMPLATES.find((t) => t.id === id) ?? null;
}
