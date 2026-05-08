import { parsePriceConstraints, productMatchesPriceConstraints } from "./price-constraints";

export type ProductRecord = {
  product_id: string;
  sku: string;
  market: string;
  title: { en: string; ar: string };
  attrs?: Record<string, string>;
  pricing?: Record<string, number>;
  images: string[];
  availability: boolean;
  search_text: string;
  tenant_id?: string;
  _score?: number;
};

export type DemoCatalogBuildMeta = {
  csvApproxBytes?: number;
  limitApplied?: number | null;
  truncated?: boolean;
  hint?: string | null;
  empty?: boolean;
  segment?: string;
  reservoirSampling?: boolean;
  stratifiedCategoryMix?: boolean;
  categorySeatPlan?: Record<string, number> | null;
  segmentUnderfilled?: boolean;
  rowsSeenInSegment?: number;
  merchOnlySlug?: string | null;
  catalogSource?: "remote_url" | "local_path" | string;
};

export type DemoCatalogFile = {
  generatedAt?: string;
  rowCount?: number;
  products: ProductRecord[];
  buildMeta?: DemoCatalogBuildMeta;
};

const STOP = new Set(
  (
    [
      "a",
      "an",
      "the",
      "for",
      "and",
      "or",
      "with",
      "under",
      "below",
      "than",
      "less",
      "more",
      "from",
      "that",
      "this",
      "these",
      "those",
      "into",
      "about",
      "some",
      "any",
      "my",
      "your",
      "our",
      "me",
      "to",
      "in",
      "on",
      "of",
      "at",
      "by",
      "is",
      "are",
      "be",
      "as",
      "it",
      "we",
      "you",
      "looking",
      "want",
      "need",
      "show",
      "find",
      "give",
      "something",
      "please",
      "gift",
      "bedroom",
      "living",
      "room",
      "aed",
      "sar",
      "dhs",
      "riyal",
      "riyals",
      "dirham",
      "dirhams",
    ] satisfies string[]
  ).map((s) => s.toLowerCase()),
);

/** Remove price clauses so amounts / currency tokens do not distort token overlap against SKUs. */
function stripPricePhrasesForTokenization(q: string): string {
  let s = q;
  const chunks: RegExp[] = [
    /\b(?:under|below|less\s+than|max|maximum|up\s+to|at\s+most|not\s+more\s+than|<)\s+[\d.,]+\s*(?:aed|sar|د\.إ|ر\.س)?\b/giu,
    /\b(?:above|over|more\s+than|at\s+least|minimum|min\.?|from)\s+[\d.,]+\s*(?:aed|sar|د\.إ|ر\.س)?\b/giu,
    /\b(?:worth|around|about|budget)\s+[\d.,]+\s*(?:aed|sar)?\s*(?:and\s+)?above\b/giu,
    /\b[\d.,]+\s*(?:aed|sar|د\.إ|ر\.س)\s+(?:and\s+)?above\b/giu,
    /\b[\d.,]+\s*(?:aed|sar)\s*\+/giu,
    /\b[\d.,]+\s*\+\s*(?:aed|sar)\b/giu,
    /\b(?:between|from)\s+[\d.,]+\s*(?:aed|sar|د\.إ|ر\.س)?\s+(?:and|to|-|–|—)\s*[\d.,]+\s*(?:aed|sar)?\b/giu,
  ];
  for (const re of chunks) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Common merchant typos → normalized forms for tokenization. */
function fixRetailSearchTypos(q: string): string {
  return q.replace(/\bshirtts\b/giu, "shirts");
}

/**
 * Shopper said "shirt(s)" but did not ask for tees / tanks — down-rank obvious T-shirt PDP copy.
 */
function wantsStructuredShirtsNotTees(canonicalQuery: string): boolean {
  const q = canonicalQuery.toLowerCase();
  if (/\bt[\s'-]*shirts?\b|\btshirts?\b|\bgraphic\s*tee\b|\btank(?:\s+top)?\b|\bsports\s+tee\b|\btee\s*shirt\b/u.test(q)) {
    return false;
  }
  return /\b(shirts|shirt)\b/u.test(q);
}

/** Title-led: H&M-style listings put the garment class in the English title. */
function titleLooksLikeTTeeShirt(p: ProductRecord): boolean {
  const t = `${p.title.en} ${p.title.ar}`.toLowerCase();
  return /\bt[\s'-]*shirts?\b|\btshirts?\b|\b(crew|v-?neck)\s*tee\b|\boversized\s+tee\b/u.test(t);
}

function normalizeQueryPhrase(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\s\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map NL-ish queries to stratified retrieval slugs emitted at CSV build (`attrs.retrieval_category`). */
export function retrievalCategoryHintsFromQuery(phrase: string, rawLower: string): Set<string> {
  const q = `${phrase} ${rawLower}`.toLowerCase();
  const s = new Set<string>();

  if (/\b(sandal|flip[-\s]*flops?|slides?|mules)\b/u.test(q)) s.add("footwear_sandals_slides");
  if (/\b(?:sneaker|trainers?|running\s+shoes?|walking\s+shoes?)\b/u.test(q)) s.add("footwear_sneakers");
  if (
    /\b(?:boots?|loafers?|(?:high\s*)?heels?|pumps|oxford\s+shoes|slip\s*[-]?\s*on\s+shoes|espadrilles?)\b|\b\d+\s*shoes\b/u.test(q)
  ) {
    if (!/\bsandal\b/u.test(q) && !s.has("footwear_sneakers")) s.add("footwear_boots_other");
  }

  if (/\b(?:t[\s'-]*shirts?|tshirts?|graphic\s*tee|crew\s*neck\s*tee|fitted\s+tee)\b|\bpolo\s*t-?shirt/u.test(q)) {
    s.add("tops_tees");
  }
  if (
    /\bdress\s*shirt|button[\s-]down|oxford\s+shirt|linen\s+shirt|woven\s+shirt|casual\s+shirt|\bblouse\b|\bkurta\b/u.test(q) ||
    (/\b(?:shirts?|blouses?)\b/u.test(q) && !/\bt[\s'-]*shirts?\b|\btshirts?\b|\bpolo\s*rugby/u.test(q))
  ) {
    s.add("tops_shirts_blouses");
  }

  if (
    /\b(?:vase|cushion|duvet|bed\s*sheet|towel|candle|stoneware|kitchenware|decor|(?:home\s+)?accent|glassware|(?:dinner\s+)?plates?)\b/u.test(
      q,
    )
  ) {
    s.add("home_living");
  }
  if (/\bwinter\b|\bwarm\b\s*(?:coat|layers?|gear|tops?|clothes)|\bfleece\b|\bthermal\b|\bpuffer\b|\bdown\s+(?:coat|jacket|puffer)|\bski\b/u.test(q)) {
    s.add("outerwear");
    s.add("knitwear");
  }
  if (/\b(?:jeans|denim)\b/u.test(q)) s.add("bottoms_jeans");
  if (/\bshorts\b|\bbermuda\b/u.test(q)) s.add("bottoms_shorts");
  if (/\b(?:trousers|pants?|chinos?|joggers?|sweatpants?)\b|\bcargo\s+pants\b/u.test(q)) s.add("bottoms_trousers");
  if (/\b(?:jacket|coat|parka|blazer|hoodie|gilet|windbreaker|puffer|cardigan)\b/u.test(q)) s.add("outerwear");
  if (/\b(?:jumper|sweater|knitted|pullover)\b/u.test(q)) s.add("knitwear");
  if (/\b(?:dress|skirts?|jumpsuits?)\b/u.test(q)) s.add("dresses_skirts");
  if (/\b(?:gym|yoga|workout|leggings?|sportswear|sport\s+racing)\b|\brunning\b.*\b(?:tights|leggings)/u.test(q)) {
    s.add("activewear");
  }

  const genderForMerch =
    /\b(men'?s|mens|for\s+men|\bmen\b|\bman\b|women'?s|womens|for\s+women|\bwomen\b|kids?\b)\b/u.test(q);
  const namesHomeProduct = /\b(?:duvet|bedding|bed\s*sheet|towel|cushion|curtain|vase|stoneware)\b/u.test(q);
  if (
    genderForMerch &&
    /\b(summer|spring)\b/u.test(q) &&
    (/\bcollection\b/u.test(q) ||
      /\b(fashion|outfits?|styles?|arrivals?|new\s+in|lookbook|clothes|clothing|apparel|wear)\b/u.test(q)) &&
    !namesHomeProduct
  ) {
    s.add("tops_tees");
    s.add("tops_shirts_blouses");
    s.add("bottoms_shorts");
    s.add("footwear_sandals_slides");
    s.add("bags_accessories");
  }
  if (/\b(?:backpack|\bbag\b|wallet|belt|scarf|\bcap\b|beanie|\bhat\b|sunglasses|jewellery|jewelry|keyring)\b/u.test(q)) {
    s.add("bags_accessories");
  }
  if (/\b(?:socks|underwear|bras?)\b/u.test(q)) s.add("underwear_lounge_socks");

  /** Generic layering / garments when copy says apparel but not jewellery/bags as product target */
  if (/\b(?:clothes|clothing|apparel|menswear|womenswear|outfits?)\b/u.test(q) && !/\b(?:belt\b|wallet|handbag|cufflinks)\b/u.test(q)) {
    s.add("tops_shirts_blouses");
    s.add("outerwear");
  }
  return s;
}

/** Apparel-heavy NL without asking for décor — suppress home / mis-token colour overlap (blackout curtains, etc.). */
export function apparelDominantQuery(raw: string): boolean {
  const ql = raw.trim().toLowerCase();
  const explicitApparelWord = /\b(?:clothes|clothing|apparel|menswear|womenswear|outfits?|\bwinter\s+wear\b|\bsummer\s+wear\b)/u.test(
    ql,
  );
  const seasonalWarm = /\bwinter\b|\bthermal\b|\bfleece\b|\bpuffer\b|\bdown\s+jacket\b/u.test(ql);
  const winterOutfitCue = /\bwinter\b/u.test(ql) && /\b(?:wear|warm|cold|snow|coat|layering)\b/u.test(ql);
  const garmentType =
    /\b(?:coat|jacket|sweater|hoodie|cardigan|parka|gilet|pullover|trousers|jeans|chinos?)\b/u.test(ql);
  const genderWithGarmentType =
    /\b(?:men|women|mens|womens|\bman\b|\bwoman\b|kids?\b)/u.test(ql) && garmentType;

  const genderSegment =
    /\b(men'?s|mens|for\s+men|\bmen\b|\bman\b|women'?s|womens|for\s+women|\bwomen\b|kids?\b|boys?\b|girls?\b)/u.test(
      ql,
    );
  /** Retail phrasing: “summer collection for men” is apparel, not bedding that happens to say “linen”. */
  const seasonalCollectionWithGender =
    /\b(summer|spring|autumn|fall)\b/u.test(ql) && /\bcollection\b/u.test(ql) && genderSegment;
  const summerEditForGender =
    /\b(summer|spring)\b/u.test(ql) &&
    genderSegment &&
    /\b(collection|arrivals?|new\s+in|lookbook|range|edit|styles?|fashion|outfits?|clothes|clothing|apparel|wear)\b/u.test(
      ql,
    );

  const homeCue = /\b(?:vase|cushion|duvet|blackout|curtain|candle\b|stoneware|homeware|bed\s*linen)\b/u.test(ql);
  const asksAccessorySKU =
    /\b(?:belt\b|wallet|crossbody|handbag|keyring|cufflinks|loafers|sandals\b|slides?\b)/u.test(ql);

  return (
    (explicitApparelWord ||
      seasonalWarm ||
      winterOutfitCue ||
      genderWithGarmentType ||
      seasonalCollectionWithGender ||
      summerEditForGender) &&
    !homeCue &&
    !asksAccessorySKU
  );
}

/** True when shopper names clothing / layered winter — restrict grid to SOFT_APPAREL buckets (drops belts / curtains noise). */
function strictSoftApparelFilter(raw: string): boolean {
  const ql = raw.trim().toLowerCase();
  return /\b(?:clothes|clothing|apparel)\b|\bwinter\s+wear\b/u.test(ql);
}

const SOFT_APPAREL_SLUG = new Set([
  "tops_tees",
  "tops_shirts_blouses",
  "knitwear",
  "outerwear",
  "bottoms_jeans",
  "bottoms_shorts",
  "bottoms_trousers",
  "dresses_skirts",
  "activewear",
  "underwear_lounge_socks",
  "footwear_sandals_slides",
  "footwear_sneakers",
  "footwear_boots_other",
]);

/** Valid `attrs.retrieval_category` values in the stratified CSV demo (+ LLM intent `merch_slugs`). */
export const DEMO_MERCH_RETRIEVAL_SLUGS = [
  "home_living",
  "tops_tees",
  "tops_shirts_blouses",
  "knitwear",
  "outerwear",
  "bottoms_jeans",
  "bottoms_trousers",
  "bottoms_shorts",
  "dresses_skirts",
  "activewear",
  "footwear_sandals_slides",
  "footwear_sneakers",
  "footwear_boots_other",
  "underwear_lounge_socks",
  "bags_accessories",
  "other",
] as const;

export const DEMO_MERCH_RETRIEVAL_SLUG_SET = new Set<string>(DEMO_MERCH_RETRIEVAL_SLUGS);

/** Optional LLM-extracted cues merged into offline lexical search (Gemini/OpenRouter JSON). */
export type CsvSearchLlmAugment = {
  expandedLexical?: string;
  gender?: "men" | "women" | "kids";
  extraColors?: string[];
  merchSlugs?: string[];
  apparelOnly?: boolean;
  negatedTerms?: string[];
};

export type SearchCsvOptions = {
  llmAugment?: CsvSearchLlmAugment | null;
};

/** Meaningful lexical tokens — drops stopwords and 1-letter noise; keeps Arabic/Unicode words. */
function queryTokens(raw: string): string[] {
  const lowered = normalizeQueryPhrase(raw)
    .split(/[^\p{L}\p{N}]+/gu)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
  /** Deduplicate while preserving order */
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of lowered) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out.slice(0, 36);
}

function customerGroupTokens(raw: string): string[] {
  return String(raw ?? "")
    .split(/[|,\/\s]+/u)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * NL cues like “men sandals” → constrain by CSV customer_group when present.
 * Note: `men'?s` matches men's/mens but **not** bare “men” — include `\bmen\b`.
 */
export function genderIntent(query: string): "men" | "women" | "kids" | null {
  const q = query.toLowerCase();
  if (/\b(women'?s|womens|\bwomen\b|ladies|lady|for women|womenwear)\b|\bwoman\b|\bfemale\b/.test(q)) return "women";
  if (/\b(boys?|girls?|kids?|children|child|bab(y|ies)|toddlers?|junior)\b/.test(q)) return "kids";
  if (
    /\b(men'?s|mens|menswear|for men)\b/.test(q) ||
    /\bmen\b/.test(q) ||
    /\bman\b/.test(q) ||
    /\bmale\b/.test(q)
  ) {
    return "men";
  }
  return null;
}

/** When shopper names a gender, up-rank SKUs whose customer_group matches; penalize empty / opposite corridor. */
function genderLexicalFactor(attrs: Record<string, string> | undefined, intent: "men" | "women" | "kids"): number {
  const raw = attrs?.customer_group ?? "";
  const t = customerGroupTokens(raw);
  if (t.length === 0) return 0.86;

  if (productMatchesGenderSegment(attrs, intent)) return 1.52;

  const hasMan = t.some((x) => x === "MAN" || x === "MEN" || x === "MENS" || x === "MEN'S");
  const hasWoman = t.some((x) => x === "WOMAN" || x === "WOMEN" || x === "LADIES");
  if (intent === "men" && hasWoman && !hasMan) return 0.025;
  if (intent === "women" && hasMan && !hasWoman) return 0.025;
  return 0.62;
}

/** Mirrors generate-demo-catalog segment rules for runtime filtering. */
export function productMatchesGenderSegment(attrs: Record<string, string> | undefined, intent: "men" | "women" | "kids"): boolean {
  const raw = attrs?.customer_group ?? "";
  const t = customerGroupTokens(raw);
  if (t.length === 0) return true;

  const hasMan = t.some((x) => x === "MAN" || x === "MEN" || x === "MENS" || x === "MEN'S");
  const hasWoman = t.some((x) => x === "WOMAN" || x === "WOMEN" || x === "LADIES");
  const hasBoy = t.includes("BOY");
  const hasGirl = t.includes("GIRL");
  const onlyChildTokens = (hasBoy || hasGirl) && !hasMan && !hasWoman;

  if (intent === "men") {
    if (onlyChildTokens) return false;
    return hasMan;
  }
  if (intent === "women") {
    if (onlyChildTokens) return false;
    return hasWoman;
  }
  return onlyChildTokens || t.some((x) => /^(BABY|CHILD|KID|KIDS|JUNIOR|TODDLER|INFANT)$/u.test(x));
}

const COLOR_ORDER = [
  "ivory",
  "indigo",
  "silver",
  "yellow",
  "orange",
  "purple",
  "cream",
  "beige",
  "brown",
  "green",
  "white",
  "black",
  "navy",
  "blue",
  "teal",
  "pink",
  "red",
  "gold",
  "grey",
  "gray",
] as const;

/** Word-boundary match so `"black"` does not match blackout / blueberry false positives */
function blobMatchesColor(blob: string, color: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(${color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})([^\\p{L}\\p{N}_]|$)`, "iu");
  return re.test(blob);
}

/** All catalogue colours cited in NL (e.g. blue + black); word-boundaries on the query kill false stems. */
export function colorHints(query: string): string[] {
  const q = normalizeQueryPhrase(query);
  const hits: string[] = [];
  for (const c of COLOR_ORDER) {
    if (!blobMatchesColor(q, c)) continue;
    if (!hits.includes(c)) hits.push(c);
  }
  return hits.slice(0, 6);
}

function productColorBlob(p: ProductRecord): string {
  return normalizeQueryPhrase(`${p.attrs?.color ?? ""} ${p.title.en} ${p.title.ar} ${p.search_text}`);
}

function skuTokenNorm(sku: string): string {
  return sku.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Count overlaps of consecutive token pairs for soft phrase match. */
function consecutivePairHits(tokens: string[], hay: string): number {
  if (tokens.length < 2) return 0;
  let h = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i] ?? "";
    const b = tokens[i + 1] ?? "";
    if (`${a} ${b}`.trim() === "") continue;
    if (hay.includes(`${a} ${b}`)) h += 1;
  }
  return h;
}

function scoreDoc(
  p: ProductRecord,
  phrase: string,
  qtok: string[],
  colorHintsList: string[],
  deprioritizeTees: boolean,
  retrievalHints: Set<string>,
  genderWant: "men" | "women" | "kids" | null,
  queryLower: string,
): number {
  const hay = p.search_text;
  const titleEn = p.title.en.toLowerCase();
  const titleAr = (p.title.ar || "").toLowerCase();
  const skuN = skuTokenNorm(String(p.sku || ""));
  const skuDisplay = String(p.sku || "").toLowerCase();
  const retrievalCat = p.attrs?.retrieval_category;

  let score = 0;

  if (phrase.length >= 3) {
    if (titleEn.includes(phrase) || titleAr.includes(phrase)) score += 48;
    else if (hay.includes(phrase)) score += 22;
  }

  score += consecutivePairHits(qtok, hay) * 12;
  score += consecutivePairHits(qtok, titleEn) * 18;

  const asciiTok = /^[a-z][a-z0-9_-]*$/i;
  for (const t of qtok) {
    const inTitle = titleEn.includes(t) || titleAr.includes(t);
    const inHay = hay.includes(t);
    if (inTitle) score += 9;
    if (inHay) score += 4;

    if (asciiTok.test(t)) {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "iu");
      if (re.test(titleEn) || re.test(titleAr)) score += 6;
      if (re.test(hay)) score += 2;
    }
  }

  if (skuDisplay && phrase.length >= 4) {
    if (skuDisplay.includes(phrase.replace(/\s+/g, ""))) score += 35;
    for (const t of qtok) {
      if (t.length >= 4 && skuN.includes(t.replace(/[^\p{L}\p{N}]/gu, ""))) score += 28;
    }
  }

  if (colorHintsList.length > 0) {
    const pcb = productColorBlob(p);
    let colorHits = 0;
    for (const cw of colorHintsList) {
      if (blobMatchesColor(pcb, cw)) colorHits++;
    }
    if (colorHits > 0) score += 12 + colorHits * 16;
    if (/\b(and|both)\b/u.test(queryLower) && colorHintsList.length >= 2 && colorHits < 2) score *= 0.55;
  }

  if (deprioritizeTees) {
    if (titleLooksLikeTTeeShirt(p)) {
      score *= 0.065;
    } else if (
      /\b(dress|oxford|linen|poplin|twill|kurta|fitted|printed|reserved|premium)\s+shirt\b|\bcasual\s+shirt\b|\bshirt\s+with\b|\blong[\s-]sleeved?\s+shirt\b|\bwoven\s+shirt\b/u.test(
        `${titleEn} ${hay}`,
      )
    ) {
      score += 24;
    }
  }

  if (retrievalHints.size > 0 && retrievalCat) {
    if (retrievalHints.has(retrievalCat)) {
      score += 44;
    } else if (!/^other$/u.test(retrievalCat)) {
      score *= 0.28;
    }
  }

  if (genderWant) {
    score *= genderLexicalFactor(p.attrs, genderWant);
  }

  if (/\bwinter\b/u.test(queryLower) && /\b(winter|wool|fleece|thermal|cold|snow|warm|knit(?:ted)?|heavyweight)\b/u.test(`${titleEn} ${hay}`)) {
    score += 26;
  }

  /** Summer vibe — do not reward “linen” on home/bedding when the shopper asked for seasonal fashion. */
  if (
    /\bsummer\b/u.test(queryLower) &&
    retrievalCat !== "home_living" &&
    /\b(summer|breathable|lightweight|beach|holiday|linen|straw|pool)\b/u.test(hay)
  ) {
    score += 12;
  }

  return score;
}

function applyNegationPenalty(p: ProductRecord, negated: string[] | undefined, score: number): number {
  if (!negated?.length) return score;
  const hay = `${p.search_text} ${p.title.en} ${p.title.ar}`.toLowerCase();
  for (const t of negated) {
    const n = String(t).trim().toLowerCase();
    if (n.length < 3) continue;
    if (hay.includes(n)) return score * 0.12;
  }
  return score;
}

export function searchCsvDemoCatalog(
  catalog: DemoCatalogFile,
  query: string,
  tenantId: string,
  pagination: { from?: number; size?: number },
  options?: SearchCsvOptions,
): {
  products: ProductRecord[];
  total: number;
  facets: {
    colors?: { key: string; count: number }[];
    markets?: { key: string; count: number }[];
    categories?: { key: string; count: number }[];
  };
  appliedFilters: Record<string, unknown>;
} {
  const items = catalog.products ?? [];
  const from = pagination.from ?? 0;
  const size = Math.min(pagination.size ?? 24, 100);
  const aug = options?.llmAugment ?? null;
  const queryFixed = fixRetailSearchTypos(query.trim());
  const augmentedQuery = aug?.expandedLexical
    ? `${queryFixed} ${aug.expandedLexical.trim()}`.replace(/\s+/g, " ").trim()
    : queryFixed;

  const priceConstraints = parsePriceConstraints(queryFixed);
  const qlRaw = augmentedQuery.toLowerCase();
  const colorBase = colorHints(queryFixed);
  const colorAugPhrase = colorHints(augmentedQuery);
  const colorFromLlm = (aug?.extraColors ?? []).map((c) => c.trim().toLowerCase()).filter((c) => c.length >= 3);
  const colorHintsList = [...new Set([...colorBase, ...colorAugPhrase, ...colorFromLlm])].slice(0, 8);

  let genderWant = genderIntent(augmentedQuery);
  if (aug?.gender) genderWant = aug.gender;

  const tokenSource = stripPricePhrasesForTokenization(augmentedQuery);
  const phrase = normalizeQueryPhrase(tokenSource);
  const qtok = queryTokens(tokenSource);
  const deprioritizeTees = wantsStructuredShirtsNotTees(phrase);
  const retrievalHints = retrievalCategoryHintsFromQuery(phrase, qlRaw);
  if (aug?.merchSlugs?.length) {
    for (const s of aug.merchSlugs) {
      const k = String(s).trim().toLowerCase().replace(/\s+/g, "_");
      if (DEMO_MERCH_RETRIEVAL_SLUG_SET.has(k)) retrievalHints.add(k);
    }
  }

  const apparelStrict = strictSoftApparelFilter(augmentedQuery) || Boolean(aug?.apparelOnly);
  const apparelLoose = apparelDominantQuery(augmentedQuery);

  let filtered = [...items];

  const hasNumericPriceFilter =
    priceConstraints.cap != null ||
    priceConstraints.floor != null ||
    (priceConstraints.rangeMin != null && priceConstraints.rangeMax != null);

  if (hasNumericPriceFilter) {
    filtered = filtered.filter((p) => productMatchesPriceConstraints(p, priceConstraints));
  }

  if (genderWant) {
    const withGroup = filtered.filter((p) => (p.attrs?.customer_group ?? "").trim().length > 0);
    if (withGroup.length > 0) {
      filtered = filtered.filter((p) => productMatchesGenderSegment(p.attrs, genderWant));
    }
  }

  if (apparelStrict) {
    filtered = filtered.filter((p) => SOFT_APPAREL_SLUG.has(p.attrs?.retrieval_category ?? "other"));
  } else if (apparelLoose) {
    filtered = filtered.filter((p) => (p.attrs?.retrieval_category ?? "") !== "home_living");
  }

  if (colorHintsList.length > 0) {
    filtered = filtered.filter((p) => colorHintsList.some((cw) => blobMatchesColor(productColorBlob(p), cw)));
  }

  const ql = qlRaw;
  const scored =
    qtok.length === 0 && phrase.length < 2
      ? filtered.map((p) => ({ ...p, _score: 1 }))
      : filtered.map((p) => {
          const raw = scoreDoc(p, phrase, qtok, colorHintsList, deprioritizeTees, retrievalHints, genderWant, ql);
          const s = applyNegationPenalty(p, aug?.negatedTerms, raw);
          return { ...p, _score: s };
        });

  scored.sort((a, b) => {
    const ds = (b._score ?? 0) - (a._score ?? 0);
    if (ds !== 0) return ds;
    return String(a.sku ?? "").localeCompare(String(b.sku ?? ""));
  });

  let page = scored;
  if (qtok.length > 0 || phrase.length >= 2) {
    page = scored.filter((p) => (p._score ?? 0) > 0);
  }

  if (qtok.length > 0 && page.length === 0) {
    const needle = phrase.replace(/\s+/g, " ");
    if (needle.length >= 3) {
      page = scored.filter((p) => p.search_text.includes(needle) || p.title.en.toLowerCase().includes(needle));
    }
  }

  const total = page.length;
  const slice = page.slice(from, from + size);

  const colors = aggregateFacet(page.map((p) => p.attrs?.color).filter(Boolean) as string[]);
  const markets = aggregateFacet(page.map((p) => p.market).filter(Boolean) as string[]);
  const categories = aggregateFacet(page.map((p) => p.attrs?.retrieval_category).filter(Boolean) as string[]);

  return {
    products: slice,
    total,
    facets: {
      colors: colors.slice(0, 20),
      markets: markets.slice(0, 20),
      categories: categories.slice(0, 18),
    },
    appliedFilters: {
      source: "csv_catalog",
      tenantId,
      priceConstraints: {
        cap: priceConstraints.cap,
        floor: priceConstraints.floor,
        rangeMin: priceConstraints.rangeMin,
        rangeMax: priceConstraints.rangeMax,
        currency: priceConstraints.currency,
      },
      genderIntent: genderWant,
      colorHints: colorHintsList,
      apparelDominantHardFilter: apparelStrict,
      apparelDominantExcludeHomeOnly: apparelLoose && !apparelStrict,
      deprioritizeTees,
      retrievalCategoryHints: [...retrievalHints],
      llmAugmentSummary: aug
        ? {
            expandedLexical: aug.expandedLexical ?? null,
            genderOverride: aug.gender ?? null,
            extraColors: aug.extraColors?.slice(0, 8) ?? null,
            merchSlugs: aug.merchSlugs?.filter((x) => DEMO_MERCH_RETRIEVAL_SLUG_SET.has(String(x).toLowerCase())).slice(0, 8) ?? null,
            apparelOnly: aug.apparelOnly ?? null,
            negatedTermsSample: aug.negatedTerms?.slice(0, 8) ?? null,
          }
        : null,
      queryTokens: qtok.slice(0, 12),
      phrase,
      catalogBuildMeta: catalog.buildMeta ?? null,
    },
  };
}

function aggregateFacet(values: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = String(v).trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
