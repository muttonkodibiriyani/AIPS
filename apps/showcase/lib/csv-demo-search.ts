type ProductRecord = {
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

export type DemoCatalogFile = {
  generatedAt?: string;
  rowCount?: number;
  products: ProductRecord[];
};

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9\u0080-\uFFFF]+/i)
    .filter((t) => t.length >= 2);
}

function priceMax(pricing: Record<string, number> | undefined): number {
  if (!pricing) return Infinity;
  const vals = Object.values(pricing).filter((n) => typeof n === "number" && Number.isFinite(n));
  if (vals.length === 0) return Infinity;
  return Math.max(...vals);
}

/** Naive "under N AED/SAR" from query */
function extractPriceCap(query: string): number | null {
  const m = query.match(/\b(?:under|below|less than|<)\s*([\d.,]+)\s*(aed|sar|د\.إ|ر\.س)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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
  ];
  const q = query.toLowerCase();
  for (const c of colors) {
    if (q.includes(c)) return c;
  }
  return null;
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
  const qtok = tokens(query);

  /** Bundled CSV demo is marketplace-agnostic; NL playground tenant is ignored here. */
  let filtered = [...items];

  /** price cap — use max of aed/sar on product */
  if (cap != null) {
    filtered = filtered.filter((p) => priceMax(p.pricing) <= cap);
  }

  if (colorWant) {
    filtered = filtered.filter((p) => {
      const c = p.attrs?.color?.toLowerCase() ?? "";
      const blob = `${c} ${p.search_text}`;
      return blob.includes(colorWant);
    });
  }

  /** score */
  const scored =
    qtok.length === 0
      ? filtered.map((p) => ({ ...p, _score: 1 }))
      : filtered.map((p) => {
          let score = 0;
          const hay = p.search_text;
          const titleEn = p.title.en.toLowerCase();
          for (const t of qtok) {
            if (hay.includes(t)) score += 2;
            if (titleEn.includes(t)) score += 5;
            if (p.sku.toLowerCase().includes(t)) score += 6;
          }
          return { ...p, _score: score };
        });

  scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

  /** empty query → show all capped */
  let page = scored;
  if (qtok.length > 0) {
    page = scored.filter((p) => (p._score ?? 0) > 0);
  }
  /** if tokenizer killed everything but user typed something meaningful, fuzzy fallback */
  if (qtok.length > 1 && page.length === 0) {
    page = scored.filter((p) => query.length >= 3 && p.search_text.includes(query.trim().toLowerCase()));
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
      colorHint: colorWant,
      queryTokens: qtok.slice(0, 12),
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
