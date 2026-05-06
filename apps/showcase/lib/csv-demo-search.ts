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
  if (/\b(?:jeans|denim)\b/u.test(q)) s.add("bottoms_jeans");
  if (/\bshorts\b|\bbermuda\b/u.test(q)) s.add("bottoms_shorts");
  if (/\b(?:trousers|pants?|chinos?|joggers?|sweatpants?)\b|\bcargo\s+pants\b/u.test(q)) s.add("bottoms_trousers");
  if (/\b(?:jacket|coat|parka|blazer|hoodie|gilet|windbreaker|puffer|cardigan)\b/u.test(q)) s.add("outerwear");
  if (/\b(?:jumper|sweater|knitted|pullover)\b/u.test(q)) s.add("knitwear");
  if (/\b(?:dress|skirts?|jumpsuits?)\b/u.test(q)) s.add("dresses_skirts");
  if (/\b(?:gym|yoga|workout|leggings?|sportswear|sport\s+racing)\b|\brunning\b.*\b(?:tights|leggings)/u.test(q)) {
    s.add("activewear");
  }
  if (/\b(?:backpack|\bbag\b|wallet|belt|scarf|\bcap\b|beanie|\bhat\b|sunglasses|jewellery|jewelry|keyring)\b/u.test(q)) {
    s.add("bags_accessories");
  }
  if (/\b(?:socks|underwear|bras?)\b/u.test(q)) s.add("underwear_lounge_socks");
  return s;
}

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

/** NL cues like “men sandals” → constrain by CSV customer_group when present. */
function genderIntent(query: string): "men" | "women" | "kids" | null {
  const q = query.toLowerCase();
  if (/\b(women'?s|womens|ladies|lady|for women|womenwear)\b|\bwoman\b|\bfemale\b/.test(q)) return "women";
  if (/\b(boys?|girls?|kids?|children|child|bab(y|ies)|toddlers?|junior)\b/.test(q)) return "kids";
  if (/\b(men'?s|mens|menswear|for men)\b|\bman\b|\bmale\b/.test(q)) return "men";
  return null;
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

function colorHint(query: string): string | null {
  const colors = [
    "white",
    "black",
    "blue",
    "red",
    "green",
    "ivory",
    "brown",
    "grey",
    "gray",
    "beige",
    "indigo",
    "pink",
    "gold",
    "silver",
    "cream",
    "navy",
    "purple",
    "yellow",
    "orange",
    "teal",
  ];
  const q = query.toLowerCase();
  let best: string | null = null;
  for (const c of colors) {
    if (!q.includes(c)) continue;
    if (!best || c.length > best.length) best = c;
  }
  return best;
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
  colorWant: string | null,
  deprioritizeTees: boolean,
  retrievalHints: Set<string>,
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

  if (colorWant) {
    const colorField = (p.attrs?.color || "").toLowerCase();
    if (colorField.includes(colorWant)) score += 14;
    else if (hay.includes(colorWant)) score += 6;
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
      score += 38;
    } else if (retrievalHints.size <= 2 && !/^other$/u.test(retrievalCat)) {
      score *= 0.65;
    }
  }

  return score;
}

export function searchCsvDemoCatalog(
  catalog: DemoCatalogFile,
  query: string,
  tenantId: string,
  pagination: { from?: number; size?: number },
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
  const queryFixed = fixRetailSearchTypos(query.trim());
  const priceConstraints = parsePriceConstraints(queryFixed);
  const colorWant = colorHint(queryFixed);
  const genderWant = genderIntent(queryFixed);
  const tokenSource = stripPricePhrasesForTokenization(queryFixed);
  const phrase = normalizeQueryPhrase(tokenSource);
  const qtok = queryTokens(tokenSource);
  const deprioritizeTees = wantsStructuredShirtsNotTees(phrase);
  const retrievalHints = retrievalCategoryHintsFromQuery(phrase, queryFixed.toLowerCase());

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

  if (colorWant) {
    filtered = filtered.filter((p) => {
      const c = p.attrs?.color?.toLowerCase() ?? "";
      const blob = `${c} ${p.search_text}`;
      return blob.includes(colorWant);
    });
  }

  const scored =
    qtok.length === 0 && phrase.length < 2
      ? filtered.map((p) => ({ ...p, _score: 1 }))
      : filtered.map((p) => {
          const s = scoreDoc(p, phrase, qtok, colorWant, deprioritizeTees, retrievalHints);
          return { ...p, _score: s };
        });

  scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

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
      colorHint: colorWant,
      deprioritizeTees,
      retrievalCategoryHints: [...retrievalHints],
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
