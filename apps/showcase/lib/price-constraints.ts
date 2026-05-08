/**
 * NL price intents for GCC retail (AED / SAR columns in CSV demo).
 * Covers caps, floors, ranges, and compact forms ("200+ aed").
 */

export type PriceCurrency = "aed" | "sar" | "any";

export type ParsedPriceConstraints = {
  /** Upper bound: "under 200 AED" */
  cap: number | null;
  /** Lower bound: "above 200 AED", "200+ aed" */
  floor: number | null;
  /** Explicit range (inclusive) when both ends parsed */
  rangeMin: number | null;
  rangeMax: number | null;
  /** Which corridor the shopper named; "any" if unspecified */
  currency: PriceCurrency;
};

function parseNum(s: string): number | null {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Map token to currency preference for filtering. */
function detectCurrencyHint(q: string): PriceCurrency {
  const lower = q.toLowerCase();
  if (
    /\b(aed|dhs?|dirhams?|uae\s+dirham|د\.إ)\b/u.test(lower) ||
    /\d[\d.,]*\s*aed\b/u.test(lower) ||
    /\d+aed\b/u.test(lower) ||
    /\b(ae|uae|emirates)\b/u.test(lower)
  ) {
    return "aed";
  }
  if (/\b(sar|ريال|ر\.س|riyals?|ksa|saudi)\b/u.test(lower) || /\d[\d.,]*\s*sar\b/u.test(lower) || /\d+sar\b/u.test(lower)) {
    return "sar";
  }
  return "any";
}

/**
 * Pull ceiling (under / below / max budget), floor (above / over / minimum),
 * and ranges (between … and …, from … to …).
 */
export function parsePriceConstraints(rawQuery: string): ParsedPriceConstraints {
  const q = rawQuery.trim();
  const lower = q.toLowerCase();
  const currency = detectCurrencyHint(q);

  let cap: number | null = null;
  let floor: number | null = null;
  let rangeMin: number | null = null;
  let rangeMax: number | null = null;

  /* --- explicit range: between X and Y | from X to Y --- */
  const rangeM = lower.match(
    /\b(?:between|from)\s+([\d.,]+)\s*(?:aed|sar|د\.إ|ر\.س)?\s+(?:and|to|-|–|—)\s*([\d.,]+)\s*(?:aed|sar)?\b/u,
  );
  if (rangeM) {
    const a = parseNum(rangeM[1] ?? "");
    const b = parseNum(rangeM[2] ?? "");
    if (a != null && b != null) {
      rangeMin = Math.min(a, b);
      rangeMax = Math.max(a, b);
    }
  }

  /* --- ceiling: under / below / less than / max / up to --- */
  let capM = lower.match(
    /\b(?:under|below|less\s+than|max|maximum|up\s+to|at\s+most|not\s+more\s+than|<)\s+([\d.,]+)\s*(aed|sar|د\.إ|ر\.س)?\b/u,
  );
  /* Compact money glued to amount ("under 120aed") — \b after the number misses before currency */
  if (!capM && rangeMin == null) {
    capM = lower.match(/\b(?:under|below|less\s+than|max|maximum|up\s+to|at\s+most|not\s+more\s+than|<)\s+([\d.,]+)(aed|sar)\b/u);
  }
  if (capM && rangeMin == null) {
    cap = parseNum(capM[1] ?? "");
  }

  /* --- floor: above / over / more than / at least / from $N+ | worth N and above --- */
  const floorPatterns: RegExp[] = [
    /\b(?:above|over|more\s+than|at\s+least|minimum|min\.?|from)\s+([\d.,]+)\s*(aed|sar|د\.إ|ر\.س)?\b/u,
    /\b(?:worth|around|about|budget)\s+([\d.,]+)\s*(aed|sar)?\s*(?:and\s+)?above\b/u,
    /\b([\d.,]+)\s*(aed|sar|د\.إ|ر\.س)\s+(?:and\s+)?above\b/u,
    /\b([\d.,]+)\s*(?:aed|sar)\s*\+/u,
    /\b([\d.,]+)\s*\+\s*(aed|sar)\b/u,
  ];
  let floorCurrency: PriceCurrency | null = null;
  if (floor == null && rangeMin == null) {
    for (const re of floorPatterns) {
      const m = lower.match(re);
      if (m) {
        floor = parseNum(m[1] ?? "");
        const g2 = m[2];
        if (g2) {
          const gl = g2.toLowerCase();
          if (gl === "sar" || g2 === "ر.س") floorCurrency = "sar";
          else if (gl === "aed" || g2 === "د.إ") floorCurrency = "aed";
        }

        if (floor != null) break;
      }
    }
  }

  /* If cap and floor conflict in same phrase, range wins; else prefer both when non-overlapping */
  const out: ParsedPriceConstraints = {
    cap,
    floor,
    rangeMin,
    rangeMax,
    currency: floorCurrency ?? currency,
  };

  if (rangeMin != null && rangeMax != null) {
    out.cap = null;
    out.floor = null;
  }

  return out;
}

function valueForCurrency(p: { pricing?: Record<string, number> }, cur: PriceCurrency): number | null {
  const pr = p.pricing;
  if (!pr) return null;
  if (cur === "aed" && pr.aed != null) return pr.aed;
  if (cur === "sar" && pr.sar != null) return pr.sar;
  if (cur === "any") {
    const vals = [pr.aed, pr.sar].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    if (vals.length === 0) return null;
    return Math.min(...vals);
  }
  /* Corridor requested but column missing — fall back to other GCC price for demo continuity */
  if (cur === "aed" && pr.sar != null) return pr.sar;
  if (cur === "sar" && pr.aed != null) return pr.aed;
  return pr.aed ?? pr.sar ?? null;
}

/** Max corridor price for strict "under" in shopper currency. */
function maxPriceForCurrency(p: { pricing?: Record<string, number> }, cur: PriceCurrency): number | null {
  const pr = p.pricing;
  if (!pr) return null;
  if (cur === "aed" && pr.aed != null) return pr.aed;
  if (cur === "sar" && pr.sar != null) return pr.sar;
  if (cur === "any") {
    const vals = [pr.aed, pr.sar].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return vals.length ? Math.max(...vals) : null;
  }
  if (cur === "aed" && pr.aed == null && pr.sar != null) return pr.sar;
  if (cur === "sar" && pr.sar == null && pr.aed != null) return pr.aed;
  return pr.aed ?? pr.sar ?? null;
}

export function productMatchesPriceConstraints(
  p: { pricing?: Record<string, number> },
  c: ParsedPriceConstraints,
): boolean {
  const cur = c.currency;

  if (c.rangeMin != null && c.rangeMax != null) {
    const v = valueForCurrency(p, cur === "any" ? "any" : cur);
    if (v == null) return false;
    return v >= c.rangeMin && v <= c.rangeMax;
  }

  if (c.cap != null) {
    const v = maxPriceForCurrency(p, cur);
    if (v == null) return false;
    if (v > c.cap) return false;
  }

  if (c.floor != null) {
    const v = valueForCurrency(p, cur === "any" ? "any" : cur);
    if (v == null) return false;
    if (v < c.floor) return false;
  }

  return true;
}
