import { shippedStructure, type LandingStructure } from './landing-structure';

/**
 * THREE PERSUASION STRUCTURES, AS A TRIAL.
 *
 * «ابنِ ثلاثة كتجربة، سلّمهم، بعدين السبعة الباقية.»
 *
 * WHY THESE THREE AND NOT ANY OTHER THREE. Five of the ten the brief
 * writes out need a block the library does not have — a comparison table,
 * a timeline, a three-tap quiz, an objection list, a mechanism diagram
 * (see `SECTIONS_THE_TEN_STILL_NEED`). Building the trial out of those
 * would mean building the blocks first and delivering nothing, or faking
 * them with `text` and delivering a page that is not the structure it
 * claims to be. These three are the ones the existing library draws
 * whole, so what is delivered here is the real thing.
 *
 * They also cover the range deliberately: a cold visitor on a medium
 * page, a hot one on a short page, and a cold one on a long page — three
 * temperatures, three lengths, three ad frameworks. A trial of three
 * near-identical structures would prove only that one works.
 *
 * NO COLOUR IS WRITTEN HERE. A page is this × a skin, and the skins are
 * `STORE_TEMPLATES`. Every one of these runs with every one of those.
 *
 * `shippedStructure` parses each at module load, so a structure that
 * breaks the contract fails the BUILD — not a test, and not a seller.
 */

export const STRUCTURE_PROBLEM_SOLUTION: LandingStructure = shippedStructure({
  id: 'problem-solution',
  name: 'المشكلة ← الحل',
  forWhom: 'زائر بارد شاف إعلاناً يعرض مشكلته',
  adFramework: 'problemSolution',
  temperature: 'cold',
  length: 'medium',
  /**
   * «البطل بالمشكلة ← ليش المشكلة بتتعب ← المحاولات الفاشلة ← الحل ←
   * كيف بيشتغل ← الدليل ← العروض ← الطلب». The three `text` blocks are
   * the three beats of the story and they are not interchangeable — the
   * slots below name which is which, which is the thing that stops this
   * being «three paragraphs».
   */
  sequence: ['hero', 'text', 'text', 'text', 'text', 'reviews', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'problem',
  slots: [
    {
      key: 'heroTitle',
      label: 'عنوان البطل',
      purpose: 'يكرّر خطّاف الإعلان بنفس الكلمات — الزائر يتعرّف على نفسه بأول سطر',
      avoid: 'لا رقم كادّعاء، ولا وعد بالشفاء، ولا اسم علامة منافسة',
      example: 'تعبان من وجع ضهرك كل صبح؟',
      max: 40,
      at: 0,
      field: 'headline',
    },
    {
      key: 'heroSub',
      label: 'سطر تحت العنوان',
      purpose: 'يسمّي المشكلة بدقّة أكثر، ويُلمّح أنّ لها حلاً — بلا بيع بعد',
      avoid: 'لا تبدأ بالبيع هنا، ولا تذكر السعر — السعر في العرض',
      example: 'مش لازم تعيش معه. في طريقة أبسط ممّا جرّبت.',
      max: 90,
      at: 0,
      field: 'subheadline',
    },
    {
      key: 'whyItHurts',
      label: 'ليش المشكلة بتتعب',
      purpose: 'يشرح كلفة المشكلة اليومية بلغة الزائر — نوم، شغل، أولاد',
      avoid: 'لا تخويف ولا ذكر أمراض ولا إحصاءات مخترعة',
      example: 'بتقوم تعبان، بتقعد بالشغل مش مركّز، وبآخر النهار ما بقي فيك تلعب مع ولادك.',
      max: 320,
      at: 1,
      field: 'body',
    },
    {
      key: 'whatFailed',
      label: 'المحاولات الفاشلة',
      purpose: 'يسمّي ما جرّبه الزائر وليش ما نفع — يبني الثقة بالاعتراف',
      avoid: 'لا تذمّ منتجاً باسمه، ولا تقل إنّ كلّ شي غيرك غش',
      example: 'جرّبت المسكّنات، بتريّح ساعتين وبترجع. وجرّبت الكمّادات، بتريّح وإنت قاعد بس.',
      max: 320,
      at: 2,
      field: 'body',
    },
    {
      key: 'theSolution',
      label: 'الحل',
      purpose: 'يقدّم المنتج كجواب على ما سبق بالضبط، بجملة واحدة واضحة',
      avoid: 'لا وعد بنتيجة بوقت محدّد، ولا كلمة «يشفي» ولا «مضمون 100٪»',
      example: 'حزام بيسند أسفل الضهر وإنت واقف وقاعد، فالعضلة بترتاح وهي شغّالة.',
      max: 200,
      at: 3,
      field: 'body',
    },
    {
      key: 'howItWorks',
      label: 'كيف بيشتغل',
      purpose: 'ثلاث خطوات على الأكثر، كل وحدة فعل يقدر الزائر يتخيّله',
      avoid: 'لا شرح علمي طويل — من يريد التفصيل عنده الأسئلة الشائعة',
      example: 'بتلبسه فوق الأواعي، بتظبط الشدّ مرة وحدة، وبتنساه.',
      max: 240,
      at: 4,
      field: 'body',
    },
  ],
  ctaRhythm: { everyNSections: 3, stickyOnMobile: true },
  proofAt: [5],
  proofKinds: ['deliveredCount'],
  firstScreen: {
    priceWithOffer: true,
    orderButton: true,
    codLine: true,
    trust: 'deliveredCount',
  },
});

export const STRUCTURE_OFFER_FIRST: LandingStructure = shippedStructure({
  id: 'offer-first',
  name: 'العرض أولاً',
  forWhom: 'زائر ساخن جاي من إعلان عرض — يعرف المنتج وبدّو السعر',
  adFramework: 'offerFirst',
  temperature: 'hot',
  length: 'short',
  /**
   * «البطل بالعرض والسعر ← الحزم ← ليش المنتج باختصار ← الدليل ←
   * الطلب». The shortest of the three on purpose: a visitor who came from
   * a price ad and is made to read four paragraphs first has been asked
   * to prove they deserve the offer.
   */
  sequence: ['hero', 'offers', 'text', 'reviews', 'urgency', 'form', 'sticky', 'footer'],
  heroKind: 'offer',
  slots: [
    {
      key: 'heroTitle',
      label: 'عنوان البطل',
      purpose: 'يقول العرض نفسه الذي وعد به الإعلان، بنفس صياغته',
      avoid: 'لا تخالف ما قاله الإعلان — الزائر جاي على وعد محدّد',
      example: 'قطعتين بسعر وحدة، لليوم',
      max: 40,
      at: 0,
      field: 'headline',
    },
    {
      key: 'heroSub',
      label: 'سطر تحت العنوان',
      purpose: 'يقول باختصار شو المنتج، لمن نسي أو وصل من إعلان صورة',
      avoid: 'لا تشرح المنتج هنا — سطر واحد وبس',
      example: 'حزام سند الضهر، مقاس واحد بيناسب الكل.',
      max: 90,
      at: 0,
      field: 'subheadline',
    },
    {
      key: 'whyShort',
      label: 'ليش المنتج — باختصار',
      purpose: 'ثلاث فوائد قصيرة لمن يحتاج تأكيداً أخيراً قبل الطلب',
      avoid: 'لا تعيد بيع المنتج من الصفر — الزائر شبه مقتنع',
      example: 'بيسند وإنت واقف، ما بيبيّن تحت الأواعي، وبينغسل بالغسّالة.',
      max: 240,
      at: 2,
      field: 'body',
    },
    {
      key: 'urgencyLine',
      label: 'سطر الإلحاح',
      purpose: 'يقول بصدق لمتى العرض — الوقت من انتهاء حقيقي والمخزون من الجرد',
      avoid: 'لا عدّاد يرجع يبلّش مع التحديث، ولا «آخر قطعة» وهي مش آخر قطعة',
      example: 'العرض لنهاية الأسبوع، وبعدها بيرجع السعر العادي.',
      max: 120,
      at: 4,
      field: 'text',
    },
  ],
  ctaRhythm: { everyNSections: 2, stickyOnMobile: true },
  proofAt: [3],
  proofKinds: ['deliveredCount', 'evidencedWas'],
  firstScreen: {
    priceWithOffer: true,
    orderButton: true,
    codLine: true,
    trust: 'deliveredCount',
  },
});

export const STRUCTURE_ORIGIN: LandingStructure = shippedStructure({
  id: 'origin',
  name: 'القصة',
  forWhom: 'زائر بارد — الثقة تُبنى من الجذور قبل البيع',
  adFramework: 'origin',
  temperature: 'cold',
  length: 'long',
  /**
   * «البطل بجملة من القصة ← من وين إجا المنتج ← ليش صنعناه ←
   * المكوّنات ← الدليل ← العروض ← الطلب».
   *
   * The longest of the three, and the one where the length is the point:
   * a story told in four sentences is not a story. «القصة لازم تكون
   * حقيقية» is not something a schema can check — it is in the guide of
   * every slot below, which is the only place it can live.
   */
  sequence: ['hero', 'text', 'text', 'text', 'gallery', 'faq', 'reviews', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'story',
  slots: [
    {
      key: 'heroTitle',
      label: 'عنوان البطل',
      purpose: 'جملة من القصة نفسها — ليست شعاراً ولا وصفاً للمنتج',
      avoid: 'لا تخترع قصة. إن لم تكن حقيقية فاستعمل بنية ثانية.',
      example: 'جدّتي كانت تعملُه بإيدها',
      max: 40,
      at: 0,
      field: 'headline',
    },
    {
      key: 'heroSub',
      label: 'سطر تحت العنوان',
      purpose: 'يربط القصة بالمنتج في سطر، بلا بيع',
      avoid: 'لا سعر ولا عرض هنا — القارئ ما زال في أول القصة',
      example: 'نفس الوصفة، بس صرنا نعبّيها بشكل بيضل محافظ عليها.',
      max: 90,
      at: 0,
      field: 'subheadline',
    },
    {
      key: 'whereFrom',
      label: 'من وين إجا المنتج',
      purpose: 'المكان والناس والزمن — تفاصيل يقدر القارئ يتحقّق منها',
      avoid: 'لا ادّعاء بشهادة أو جائزة بلا ورقة، ولا «سر توارثته الأجيال»',
      example: 'من بيت بريف حمص، كانت الخلطة تتعمل كل خريف وتتوزّع على الجيران.',
      max: 420,
      at: 1,
      field: 'body',
    },
    {
      key: 'whyWeMadeIt',
      label: 'ليش صنعناه',
      purpose: 'السبب الذي دفع صاحب المتجر — شخصي ومحدّد',
      avoid: 'لا «رسالتنا أن نغيّر العالم» — جملة لا يصدّقها أحد',
      example: 'لمّا خلصت كمية جدّتي، دوّرنا بالسوق وما لقينا شي قريب، فقرّرنا نعملها.',
      max: 420,
      at: 2,
      field: 'body',
    },
    {
      key: 'ingredients',
      label: 'المكوّنات',
      purpose: 'ماذا فيه وماذا يفعل كلٌّ منها — بلغة بسيطة',
      avoid: 'لا ادّعاء علاجي لأيّ مكوّن، ولا نسبة مئوية بلا تحليل',
      example: 'زيت زيتون للترطيب، شمع عسل ليثبّت، وزيت لوز للرائحة.',
      max: 420,
      at: 3,
      field: 'body',
    },
  ],
  ctaRhythm: { everyNSections: 4, stickyOnMobile: true },
  proofAt: [6],
  proofKinds: ['deliveredCount'],
  firstScreen: {
    priceWithOffer: true,
    orderButton: true,
    codLine: true,
    trust: 'deliveredCount',
  },
});

export const STRUCTURE_US_VS_THEM: LandingStructure = shippedStructure({
  id: 'us-vs-them',
  name: 'نحن مقابل هم',
  forWhom: 'زائر دافئ يقارن قبل أن يطلب',
  adFramework: 'usVsThem',
  temperature: 'warm',
  length: 'medium',
  /** «البطل بالمقارنة ← جدول ← ليش الفرق ← الدليل ← العروض ← الطلب». */
  sequence: ['hero', 'comparison', 'text', 'reviews', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'contrast',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'يسمّي الفرق الذي يهمّ المشتري، لا اسم المنتج',
      avoid: 'لا تذكر علامة منافسة باسمها — المقارنة بالصفات لا بالأسماء',
      example: 'الفرق إنّه بينشف بدقيقة',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يعد بأنّ المقارنة تحت هذا السطر، فيدفع للنزول',
      avoid: 'لا تبدأ بالسعر — المشتري ما زال يقارن',
      example: 'شوف الفرق بنفسك، صف بصف.',
    },
    {
      key: 'tableTitle', label: 'عنوان الجدول', at: 1, field: 'title', max: 60,
      purpose: 'يؤطّر الجدول كمقارنة عادلة لا كهجوم',
      avoid: 'لا «الأفضل بالسوق» ولا «الوحيد الذي» — ادّعاء لا يُتحقَّق منه',
      example: 'نفس السعر، شو بيفرق؟',
    },
    /*
     * THE THREE ROWS. Each is one thing a customer can CHECK — the brief's
     * own rule for this block — so each cell carries its own «ممنوع»: no
     * competitor named, and nothing that cannot be verified by holding both.
     */
    {
      key: 'row1Aspect', label: 'الفرق الأول — الوجه', at: 1, field: 'rows.0.aspect', max: 40,
      purpose: 'الشيء الذي يقارنه الزبون أول ما يمسك الاثنين',
      avoid: 'لا تقارن بما لا يُرى ولا يُجرَّب',
      example: 'الإحساس على البشرة',
    },
    {
      key: 'row1Ours', label: 'الفرق الأول — عندنا', at: 1, field: 'rows.0.ours', max: 60,
      purpose: 'وصف قصير يقدر يتأكّد منه بنفسه',
      avoid: 'لا مبالغة — جملة يكذّبها الاستعمال تُفقد الباقي',
      example: 'يمتصّ بدقيقة',
    },
    {
      key: 'row1Theirs', label: 'الفرق الأول — البدائل', at: 1, field: 'rows.0.theirs', max: 60,
      purpose: 'ما يحصل عادةً مع غيره، بلا تسمية أحد',
      avoid: 'لا اسم علامة، ولا «كلّهم غش»',
      example: 'طبقة دهنيّة بتبقى',
    },
    {
      key: 'row2Aspect', label: 'الفرق الثاني — الوجه', at: 1, field: 'rows.1.aspect', max: 40,
      purpose: 'وجه ثانٍ مختلف عن الأول، لا إعادة صياغته',
      avoid: 'لا تكرّر الفرق الأول بكلمات ثانية',
      example: 'الرائحة',
    },
    {
      key: 'row2Ours', label: 'الفرق الثاني — عندنا', at: 1, field: 'rows.1.ours', max: 60,
      purpose: 'الحقيقة كما هي، حتى لو كانت «بلا»',
      avoid: 'لا تحوّل غياب شيء إلى ادّعاء',
      example: 'بلا عطر مضاف',
    },
    {
      key: 'row2Theirs', label: 'الفرق الثاني — البدائل', at: 1, field: 'rows.1.theirs', max: 60,
      purpose: 'المقابل الشائع، بلا تحقير',
      avoid: 'لا تصف رائحة منتج بعينه — الوصف للعادة لا لعلامة',
      example: 'عطر قوي',
    },
    {
      key: 'row3Aspect', label: 'الفرق الثالث — الوجه', at: 1, field: 'rows.2.aspect', max: 40,
      purpose: 'الوجه الذي يقرّر عنده الزبون عادةً',
      avoid: 'لا تجعله السعر — السعر في العروض',
      example: 'الكمّية',
    },
    {
      key: 'row3Ours', label: 'الفرق الثالث — عندنا', at: 1, field: 'rows.2.ours', max: 60,
      purpose: 'ما يحصل عليه فعلاً',
      avoid: 'لا تعد بما لا تضمنه كلّ علبة',
      example: 'يكفي شهرين',
    },
    {
      key: 'row3Theirs', label: 'الفرق الثالث — البدائل', at: 1, field: 'rows.2.theirs', max: 60,
      purpose: 'المعتاد في السوق',
      avoid: 'لا تخترع رقماً لغيرك — اكتب ما تعرفه لا ما تظنّه',
      example: 'ثلاثة أسابيع',
    },
    {
      key: 'whyTheDifference', label: 'ليش الفرق', at: 2, field: 'body', max: 320,
      purpose: 'يشرح سبب الفرق بشيء يقدر المشتري يتحقّق منه — خامة أو طريقة صنع',
      avoid: 'لا تقل إنّ غيرك غشّ؛ قل ما تفعله أنت ولماذا',
      example: 'منستعمل زبدة شيا بدل زيوت معدنية، فالملمس أخف والامتصاص أسرع.',
    },
  ],
  ctaRhythm: { everyNSections: 3, stickyOnMobile: true },
  proofAt: [3],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

export const STRUCTURE_UGC: LandingStructure = shippedStructure({
  id: 'ugc',
  name: 'شهادات الناس',
  forWhom: 'زائر بارد إلى دافئ من إعلان بصوت زبون',
  adFramework: 'ugc',
  temperature: 'cold',
  length: 'short',
  /** «البطل بشهادة ← فقاعات واتساب ← الأرقام الحقيقية ← العروض ← الطلب». */
  sequence: ['hero', 'reviews', 'trust', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'testimonial',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'جملة من كلام زبون حقيقي، بصياغته هو',
      avoid: 'لا تكتب شهادة من عندك. إن لم تكن حقيقية فاستعمل بنية ثانية.',
      example: 'ما توقّعت يفرق هالقد',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يقول من قالها ومن أين، بلا اسم كامل',
      avoid: 'لا تنشر اسماً كاملاً ولا رقماً ولا صورةً بلا إذن صاحبها',
      example: 'أم محمد — عمّان، طلبت الشهر الماضي',
    },
    {
      key: 'reviewsTitle', label: 'عنوان الآراء', at: 1, field: 'title', max: 60,
      purpose: 'يقول إنّ ما تحته كلام مشترين، لا كلام المتجر',
      avoid: 'لا «آراء عملائنا السعداء» — صياغة تقرأ كإعلان',
      example: 'شو حكوا الناس',
    },
  ],
  ctaRhythm: { everyNSections: 2, stickyOnMobile: true },
  proofAt: [1, 2],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

export const STRUCTURE_THE_HACK: LandingStructure = shippedStructure({
  id: 'the-hack',
  name: 'الاكتشاف',
  forWhom: 'زائر بارد يحبّ يعرف الطريقة الأبسط',
  adFramework: 'theHack',
  temperature: 'cold',
  length: 'medium',
  /** «البطل بالاكتشاف ← شو كان غلط ← الطريقة الأبسط ← كيف بيشتغل ← الدليل ← العروض ← الطلب». */
  sequence: ['hero', 'text', 'text', 'mechanism', 'reviews', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'discovery',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'يقدّم الاكتشاف كملاحظة بسيطة، لا كسرّ',
      avoid: 'لا «سرّ ما بدهم إياك تعرفه» ولا وعد مبالغ — فضول صادق فقط',
      example: 'الخطأ إنّك بتحطّه ع بشرة ناشفة',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يلمّح إلى أنّ التصحيح بسيط ومجاني في خطوة',
      avoid: 'لا تبِع هنا — الزائر ما زال فضولياً',
      example: 'التعديل بياخد ثانيتين وبيفرق.',
    },
    {
      key: 'whatWasWrong', label: 'شو كان غلط', at: 1, field: 'body', max: 320,
      purpose: 'يسمّي العادة الشائعة ولماذا تضيّع الفائدة',
      avoid: 'لا تسخر من القارئ — هو يفعلها، وهي عادة معقولة',
      example: 'أغلبنا بيحطّه بعد ما توصل البشرة تنشف، وقتها بيكون أغلب الماء راح.',
    },
    {
      key: 'simplerWay', label: 'الطريقة الأبسط', at: 2, field: 'body', max: 320,
      purpose: 'الخطوة المصحّحة، بجملتين على الأكثر',
      avoid: 'لا تعِد بنتيجة بوقت محدّد',
      example: 'حطّه والبشرة لسا رطبة من الغسيل، فبيحبس الماء مكانه.',
    },
  ],
  ctaRhythm: { everyNSections: 3, stickyOnMobile: true },
  proofAt: [4],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

export const STRUCTURE_MECHANISM: LandingStructure = shippedStructure({
  id: 'mechanism',
  name: 'العلم خلفه',
  forWhom: 'زائر دافئ يقتنع بالفهم لا بالوعد',
  adFramework: 'mechanism',
  temperature: 'warm',
  length: 'long',
  /** «البطل بالآلية ← رسم ← المكوّنات ← الأسئلة العلمية ← الدليل ← العروض ← الطلب». */
  sequence: ['hero', 'mechanism', 'text', 'faq', 'reviews', 'trust', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'mechanism',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'يسمّي الآلية في جملة يفهمها غير المتخصّص',
      avoid: 'لا مصطلح علمي بلا شرح، ولا ادّعاء علاجي',
      example: 'بيحبس الماء، ما بيضيف ماء',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يعِد بشرح كامل تحت، فيستحقّ الصفحة الطويلة',
      avoid: 'لا تبالغ بالدقّة — ادّعاءات متواضعة ومحدّدة',
      example: 'تحت بتلاقي كل مكوّن وشو بيعمل بالضبط.',
    },
    {
      key: 'mechanismTitle', label: 'عنوان الآلية', at: 1, field: 'title', max: 60,
      purpose: 'يؤطّر الخطوات كشرح لا كبيع',
      avoid: 'لا «تقنية ثورية» ولا «براءة اختراع» بلا ورقة',
      example: 'كيف بيشتغل، خطوة خطوة',
    },
    /*
     * HOW IT WORKS, IN THREE VERBS — and the ingredients beside them.
     *
     * The block's own schema refuses a percentage on an ingredient, so these
     * say what each DOES. «يحتوي على 2٪ من كذا» is a claim; «يسحب الماء
     * ويثبّته» is something a person can picture.
     */
    {
      key: 'step1Title', label: 'الخطوة الأولى — الفعل', at: 1, field: 'steps.0.title', max: 24,
      purpose: 'فعل واحد يتخيّله الزائر',
      avoid: 'لا مصطلح علمي في العنوان',
      example: 'يملأ',
    },
    {
      key: 'step1Text', label: 'الخطوة الأولى — الشرح', at: 1, field: 'steps.0.text', max: 120,
      purpose: 'جملة تشرح الفعل بلغة يومية',
      avoid: 'لا شرح طويل — التفصيل في الأسئلة الشائعة',
      example: 'بيسدّ الفراغ بين خلايا السطح',
    },
    {
      key: 'step2Title', label: 'الخطوة الثانية — الفعل', at: 1, field: 'steps.1.title', max: 24,
      purpose: 'الفعل الذي يلي الأول منطقياً',
      avoid: 'لا تكرّر الفعل الأول',
      example: 'يمسك',
    },
    {
      key: 'step2Text', label: 'الخطوة الثانية — الشرح', at: 1, field: 'steps.1.text', max: 120,
      purpose: 'ماذا يحصل بعد الأولى',
      avoid: 'لا وعد بنتيجة هنا — هذا شرح لا بيع',
      example: 'بيحبس الماء داخل الطبقة',
    },
    {
      key: 'step3Title', label: 'الخطوة الثالثة — الفعل', at: 1, field: 'steps.2.title', max: 24,
      purpose: 'الفعل الذي يُغلق الشرح',
      avoid: 'لا «يشفي» ولا «يعالج»',
      example: 'يحمي',
    },
    {
      key: 'step3Text', label: 'الخطوة الثالثة — الشرح', at: 1, field: 'steps.2.text', max: 120,
      purpose: 'ما الذي يمنعه من الرجوع',
      avoid: 'لا ادّعاء طبّي',
      example: 'بيمنع الجفاف من الهواء',
    },
    {
      key: 'ing1Name', label: 'المكوّن الأول — الاسم', at: 1, field: 'ingredients.0.name', max: 40,
      purpose: 'اسم يعرفه الزبون أو يقدر يبحث عنه',
      avoid: 'لا نسبة مئوية — الكتلة ترفضها',
      example: 'سيراميد',
    },
    {
      key: 'ing1Does', label: 'المكوّن الأول — شو بيعمل', at: 1, field: 'ingredients.0.does', max: 80,
      purpose: 'وظيفته بجملة، لا تركيبه',
      avoid: 'لا نسبة مئوية ولا «المكوّن النشط الأقوى»',
      example: 'بيرمّم الحاجز',
    },
    {
      key: 'ing2Name', label: 'المكوّن الثاني — الاسم', at: 1, field: 'ingredients.1.name', max: 40,
      purpose: 'مكوّن ثانٍ له دور مختلف',
      avoid: 'لا تعدّد مكوّنات بلا دور لكلّ واحد',
      example: 'جليسرين',
    },
    {
      key: 'ing2Does', label: 'المكوّن الثاني — شو بيعمل', at: 1, field: 'ingredients.1.does', max: 80,
      purpose: 'دوره، ولماذا هو مع الأول',
      avoid: 'لا تقل إنّه يضاعف أثر الأول — هذا ادّعاء لا وصف',
      example: 'بيسحب الماء وبيثبّته',
    },
    {
      key: 'honestLimits', label: 'حدود الوعد', at: 2, field: 'body', max: 320,
      purpose: 'يقول بصراحة ما لا يفعله المنتج — وهذا ما يجعل الباقي مصدَّقاً',
      avoid: 'لا تُخفِ الحدّ. القارئ الذي يكتشفه لاحقاً يرجع المنتج.',
      example: 'ما بيعالج حساسية ولا بيبدّل علاج الطبيب. بيرطّب، وبيعمل هذا منيح.',
    },
  ],
  ctaRhythm: { everyNSections: 4, stickyOnMobile: true },
  proofAt: [4, 5],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

export const STRUCTURE_TRANSFORMATION: LandingStructure = shippedStructure({
  id: 'transformation',
  name: 'رحلة التحوّل',
  forWhom: 'زائر دافئ بدّه يعرف شو بيصير مع الوقت',
  adFramework: 'transformation',
  temperature: 'warm',
  length: 'medium',
  /** «البطل بالنتيجة ← خط زمني ← كيف تستخدمه ← الدليل ← العروض ← الطلب». */
  sequence: ['hero', 'timeline', 'text', 'reviews', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'outcome',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'النتيجة كما يصفها مستخدم، لا كما يصفها إعلان',
      avoid: 'لا وعد بمدّة محدّدة في العنوان — المدّة في الخط الزمني',
      example: 'بشرة ما بتشدّ بعد الغسيل',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يمهّد للخطّ الزمني ويصدق بأنّ التغيّر تدريجي',
      avoid: 'لا «نتيجة فورية» — وعد يكذّبه أوّل استعمال',
      example: 'التغيّر بيجي على مراحل، وهاي المراحل.',
    },
    {
      key: 'timelineTitle', label: 'عنوان الخط الزمني', at: 1, field: 'title', max: 60,
      purpose: 'يضع توقّعاً صادقاً قبل أن يقرأ المراحل',
      avoid: 'لا صور قبل وبعد، ولا تلميح إليها',
      example: 'شو بيصير أسبوع بعد أسبوع',
    },
    /*
     * THE THREE POINTS — the thing that makes this structure this structure.
     *
     * Each cell is its own slot because each wants its own guide: the first
     * stage must promise little, the last must not promise a cure. A single
     * «املأ الجدول» could say neither.
     */
    {
      key: 'stage1When', label: 'المرحلة الأولى — متى', at: 1, field: 'points.0.when', max: 24,
      purpose: 'مدّة قصيرة يقدر الزائر يتأكّد منها بنفسه',
      avoid: 'لا تبدأ بيوم واحد — تغيّر بيوم لا يصدّقه أحد. والمدّة بالكلمات لا بالأرقام',
      example: 'أول أسبوع',
    },
    {
      key: 'stage1What', label: 'المرحلة الأولى — ماذا يحدث', at: 1, field: 'points.0.what', max: 120,
      purpose: 'أصغر تغيّر حقيقي، وهو ما يبقي الزائر مستعملاً',
      avoid: 'لا نتيجة كبيرة بأول أسبوع — هنا تُفقد الثقة',
      example: 'الشدّ بعد الغسيل بيروح',
    },
    {
      key: 'stage2When', label: 'المرحلة الوسطى — متى', at: 1, field: 'points.1.when', max: 24,
      purpose: 'المدّة التي يبدأ عندها غيرُه يلاحظ',
      avoid: 'لا تقفز شهوراً — الفجوة الكبيرة تقرأ كتهرّب',
      example: 'الأسبوع الثالث',
    },
    {
      key: 'stage2What', label: 'المرحلة الوسطى — ماذا يحدث', at: 1, field: 'points.1.what', max: 120,
      purpose: 'تغيّر يراه غيرُه، لا هو وحده',
      avoid: 'لا ذكر لحالة مرضية ولا لعلاجها',
      example: 'البشرة بتتماسك والاحمرار بيقلّ',
    },
    {
      key: 'stage3When', label: 'المرحلة الأخيرة — متى', at: 1, field: 'points.2.when', max: 24,
      purpose: 'المدّة التي تستقرّ عندها النتيجة',
      avoid: 'لا «للأبد» ولا «نهائياً»',
      example: 'الأسبوع الثامن',
    },
    {
      key: 'stage3What', label: 'المرحلة الأخيرة — ماذا يحدث', at: 1, field: 'points.2.what', max: 120,
      purpose: 'الحالة التي تثبت عليها مع الاستمرار',
      avoid: 'لا وعد بالشفاء ولا بنتيجة دائمة بلا استعمال',
      example: 'الملمس بيستوي وبيثبت مع الاستعمال',
    },
    {
      key: 'howToUse', label: 'كيف تستخدمه', at: 2, field: 'body', max: 320,
      purpose: 'الاستعمال اليومي بثلاث خطوات على الأكثر — الالتزام هو ما يصنع النتيجة',
      avoid: 'لا تعقّد الروتين؛ روتين من خمس خطوات لا يلتزم به أحد',
      example: 'مرّة بالليل على بشرة رطبة، وبس. ما بدّه كريم ثاني فوقه.',
    },
  ],
  ctaRhythm: { everyNSections: 3, stickyOnMobile: true },
  proofAt: [3],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

export const STRUCTURE_QUIZ: LandingStructure = shippedStructure({
  id: 'quiz',
  name: 'الاختبار',
  forWhom: 'زائر بارد — من يجيب نيّته أعلى ومرتجعاته أقل',
  adFramework: 'quiz',
  temperature: 'cold',
  length: 'short',
  /** «البطل بسؤال ← ثلاثة أسئلة ← التوصية ← العرض المطابق ← الطلب». */
  sequence: ['hero', 'quiz', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'question',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'سؤال يعرف الزائر جوابه عن نفسه فوراً',
      avoid: 'لا سؤال بلاغي ولا سؤال جوابه واضح — يصير إعلاناً',
      example: 'بشرتك بتشدّ بعد الغسيل؟',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يعِد بثلاث ضغطات فقط — وهذا الوعد هو ما يجعله يبدأ',
      avoid: 'لا تطلب بريداً ولا رقماً قبل التوصية',
      example: 'ثلاث أسئلة وبنقلّك أي واحد يناسبك.',
    },
    {
      key: 'quizTitle', label: 'عنوان الاختبار', at: 1, field: 'title', max: 60,
      purpose: 'يؤكّد أنّ الأسئلة قصيرة وبلا تسجيل',
      avoid: 'لا «اختبار علمي» ولا تشخيص — هذه توصية منتج',
      example: 'ثلاثة أسئلة وبس',
    },
    /*
     * THREE QUESTIONS AND NO MORE — «أسئلة بسيطة بضغطة، ثلاثة أسئلة كحدّ
     * أقصى». A visitor who came from an advert does not fill forms to be
     * sold to, and the block's own schema refuses a fourth.
     */
    {
      key: 'q1', label: 'السؤال الأول', at: 1, field: 'questions.0.ask', max: 80,
      purpose: 'سؤال عن حالته هو، يعرف جوابه بلا تفكير',
      avoid: 'لا سؤال عن تشخيص ولا عن مرض',
      example: 'كيف بشرتك آخر النهار؟',
    },
    {
      key: 'q2', label: 'السؤال الثاني', at: 1, field: 'questions.1.ask', max: 80,
      purpose: 'سؤال عن عادته، يضيّق التوصية',
      avoid: 'لا سؤال يحرجه ولا يطلب رقماً',
      example: 'بتستعمل كريم كل يوم؟',
    },
    {
      key: 'q3', label: 'السؤال الثالث', at: 1, field: 'questions.2.ask', max: 80,
      purpose: 'آخر سؤال، وبعده التوصية مباشرة',
      avoid: 'لا تسأل رابعاً — الاختبار يصير استمارة',
      example: 'في احمرار؟',
    },
    {
      key: 'quizResult', label: 'التوصية', at: 1, field: 'result', max: 240,
      purpose: 'يسمّي العرض المناسب ويُبقي الباقي ظاهراً — التوصية اقتراح لا قرار',
      avoid: 'لا تُخفِ باقي العروض، ولا تقل إنّ غيرها لا يناسبه',
      example: 'إذا كانت بتشدّ، ابدأ بالعبوة الكبيرة — بتكفي شهر وبتوصل أرخص.',
    },
  ],
  ctaRhythm: { everyNSections: 2, stickyOnMobile: true },
  proofAt: [2],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

export const STRUCTURE_OBJECTIONS: LandingStructure = shippedStructure({
  id: 'objections',
  name: 'كاسر الاعتراضات',
  forWhom: 'زائر متردّد — للمنتجات الأغلى والأجهزة',
  adFramework: 'objections',
  temperature: 'hesitant',
  length: 'long',
  /** «البطل بأكبر اعتراض ← خمسة اعتراضات وجوابها ← الضمان ← المواصفات ← الدليل ← العروض ← الطلب». */
  sequence: ['hero', 'objections', 'text', 'faq', 'reviews', 'trust', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'doubt',
  slots: [
    {
      key: 'heroTitle', label: 'عنوان البطل', at: 0, field: 'headline', max: 40,
      purpose: 'يقول أكبر اعتراض بصوت القارئ قبل أن يقوله هو',
      avoid: 'لا تدافع في العنوان — سمِّ الشكّ فقط',
      example: 'غالي؟ معك حق تسأل',
    },
    {
      key: 'heroSub', label: 'سطر تحت العنوان', at: 0, field: 'subheadline', max: 90,
      purpose: 'يعِد بأنّ كلّ شكّ تحته مكتوب ومجاب',
      avoid: 'لا تعِد بخصم مقابل الثقة',
      example: 'كل سؤال بيخطر ببالك، مكتوب تحت مع جوابه.',
    },
    {
      key: 'objectionsGuarantee', label: 'الضمان', at: 1, field: 'guarantee', max: 240,
      purpose: 'يقول بالضبط ماذا يحدث إن لم يناسبه — مدّة وطريقة ومن يدفع الشحن',
      avoid: 'لا «ضمان مدى الحياة» ولا شرط مخفيّ في سطر صغير',
      example: 'ما ناسبك خلال أسبوع؟ منستلمه من عندك ومنرجّعلك المبلغ كامل.',
    },
    /*
     * THE THREE DOUBTS, IN THE VISITOR'S OWN WORDS — and each answered
     * without arguing with him. «ممكن تكون عم تفكر…» is the block's shape:
     * say the doubt better than he would, then answer it.
     */
    {
      key: 'doubt1', label: 'الاعتراض الأول', at: 1, field: 'items.0.doubt', max: 80,
      purpose: 'أشيع سبب يمنع الشراء، بكلماته هو',
      avoid: 'لا تصغّر الاعتراض ولا تسخر منه',
      example: 'جرّبت كتير وما نفع',
    },
    {
      key: 'answer1', label: 'جواب الأول', at: 1, field: 'items.0.answer', max: 200,
      purpose: 'جواب يعترف أوّلاً ثم يفرّق',
      avoid: 'لا تقل «هذا مختلف» بلا سبب يُفحص',
      example: 'هاد بيشتغل على الحاجز نفسه، وبيبيّن بأسبوع.',
    },
    {
      key: 'doubt2', label: 'الاعتراض الثاني', at: 1, field: 'items.1.doubt', max: 80,
      purpose: 'خوف من ضرر أو من عدم المناسبة',
      avoid: 'لا تذكر حالة مرضية',
      example: 'بشرتي حسّاسة',
    },
    {
      key: 'answer2', label: 'جواب الثاني', at: 1, field: 'items.1.answer', max: 200,
      purpose: 'جواب يعطيه طريقة يتأكّد بها بنفسه',
      avoid: 'لا «مضمون 100٪» ولا «آمن تماماً»',
      example: 'بلا عطر ولا كحول — جرّبيه على الساعد أول يوم.',
    },
    {
      key: 'doubt3', label: 'الاعتراض الثالث', at: 1, field: 'items.2.doubt', max: 80,
      purpose: 'الاعتراض الأخير، وغالباً السعر',
      avoid: 'لا تتهرّب منه — تركه يقرأ كأنّك تعرف أنّه محقّ',
      example: 'السعر',
    },
    {
      key: 'answer3', label: 'جواب الثالث', at: 1, field: 'items.2.answer', max: 200,
      purpose: 'جواب يحوّل السعر إلى كلفة استعمال',
      avoid: 'لا تقارن بسعر منافس باسمه',
      example: 'العلبة بتكفي شهرين، فالكلفة باليوم أقلّ ممّا بتتوقّع.',
    },
    {
      key: 'specs', label: 'المواصفات', at: 2, field: 'body', max: 420,
      purpose: 'الأرقام التي يقدر المشتري يقارنها — حجم ووزن ومدّة ومحتوى العلبة',
      avoid: 'لا تضع رقماً لا تقدر تثبته على العلبة',
      example: 'العبوة 50 مل، وزنها 120 غرام، وبتكفي شهر باستعمال مرّة بالليل.',
      mayContainDigits: true,
    },
  ],
  ctaRhythm: { everyNSections: 4, stickyOnMobile: true },
  proofAt: [4, 5],
  proofKinds: ['deliveredCount'],
  firstScreen: { priceWithOffer: true, orderButton: true, codLine: true, trust: 'deliveredCount' },
});

/**
 * The trial three. The remaining seven follow once the five missing
 * blocks exist — see `SECTIONS_THE_TEN_STILL_NEED`.
 */
export const LANDING_STRUCTURES: readonly LandingStructure[] = Object.freeze([
  STRUCTURE_PROBLEM_SOLUTION,
  STRUCTURE_US_VS_THEM,
  STRUCTURE_UGC,
  STRUCTURE_THE_HACK,
  STRUCTURE_MECHANISM,
  STRUCTURE_TRANSFORMATION,
  STRUCTURE_OFFER_FIRST,
  STRUCTURE_QUIZ,
  STRUCTURE_ORIGIN,
  STRUCTURE_OBJECTIONS,
]);
