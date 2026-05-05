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
    ] satisfies string[]
  ).map((s) => s.toLowerCase()),
);

function normalizeQueryPhrase(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\s\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function priceMax(pricing: Record<string, number> | undefined): number {
  if (!pricing) return Infinity;
  const vals = Object.values(pricing).filter((n) => typeof n === "number" && Number.isFinite(n));
  if (vals.length === 0) return Infinity;
  return Math.max(...vals);
}

/** Extract "under/below N (SAR|AED|…)" from natural language. */
function extractPriceCap(query: string): number | null {
  const m = query.match(/\b(?:under|below|less than|<)\s*([\d.,]+)\s*(aed|sar|د\.إ|ر\.س)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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
): number {
  const hay = p.search_text;
  const titleEn = p.title.en.toLowerCase();
  const titleAr = (p.title.ar || "").toLowerCase();
  const skuN = skuTokenNorm(String(p.sku || ""));
  const skuDisplay = String(p.sku || "").toLowerCase();

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
  facets: { colors?: { key: string; count: number }[]; markets?: { key: string; count: number }[] };
  appliedFilters: Record<string, unknown>;
} {
  const items = catalog.products ?? [];
  const from = pagination.from ?? 0;
  const size = Math.min(pagination.size ?? 24, 100);
  const cap = extractPriceCap(query);
  const colorWant = colorHint(query);
  const genderWant = genderIntent(query);
  const phrase = normalizeQueryPhrase(query);
  const qtok = queryTokens(query);

  let filtered = [...items];

  if (cap != null) {
    filtered = filtered.filter((p) => priceMax(p.pricing) <= cap);
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
          const s = scoreDoc(p, phrase, qtok, colorWant);
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

  return {
    products: slice,
    total,
    facets: { colors: colors.slice(0, 20), markets: markets.slice(0, 20) },
    appliedFilters: {
      source: "csv_catalog",
      tenantId,
      priceCap: cap,
      genderIntent: genderWant,
      colorHint: colorWant,
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
