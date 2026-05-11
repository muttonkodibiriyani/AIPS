import type { CsvSearchLlmAugment } from "./csv-demo-search";

/**
 * Deterministic retail-intent layer (works without LLM keys). Inspired by RAG search stacks
 * (e.g. Vane: retrieve → constrain → synthesize): we add **hard negations** and **lexical expansion**
 * for known homonyms so BM25-ish overlap does not hijack intent.
 */

export function occasionPartyEveningQuery(q: string): boolean {
  const ql = q.trim().toLowerCase();
  return (
    /\bparty\s+wear\b/u.test(ql) ||
    /\b(?:cocktail|gala|prom|dressy)\b/u.test(ql) ||
    /\b(?:evening\s+wear|night\s+out|going\s+out)\b/u.test(ql) ||
    /\b(?:club|clubbing)\s+wear\b/u.test(ql) ||
    /\b(?:for\s+(?:a\s+)?party|(?:to\s+a|at\s+(?:the\s+)?)(?:party|club|event|prom))\b/u.test(ql)
  );
}

/** "cool" as slang for stylish—not Thermos® / insulated "cool bag" category. */
export function stylisticCoolLikely(q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (/\bcool\s+bag\b|\bcooler\b|\blunch\s+bag\b|\binsulated\b|\bthermal\s+bag\b/u.test(ql)) {
    return false;
  }
  if (!/\bcool\b/u.test(ql)) return false;
  return (
    /\b(looks?\s+cool|look\s+cool|something\s+cool|feel\s+cool|cool\s+outfit|cool\s+look|cool\s+for\s+)/u.test(ql) ||
    /\b(party|wear|outfit|summer|dress|style|fashion|suggest)\b/u.test(ql)
  );
}

export function heuristicPartyExpandedLexical(): string {
  return "evening dress midi maxi cocktail satin lace blazer smart casual heels going out wedding guest summer party outfit";
}

export function heuristicCoolerCollateralNegations(): string[] {
  return ["cool bag", "printed cool bag", "lunch bag", "insulated", "cooler", "thermal bag"];
}

/** Gender + "wear" retail phrasing ("women pink wear") — apparel, not homeware. */
export function genderFashionWearQuery(q: string): boolean {
  const ql = q.trim().toLowerCase();
  /** Seasonal "winter wear" / "summer wear" is handled by apparel parsers; avoids injecting generic fashion expansion + décor negations. */
  if (/\b(?:winter|summer|spring|autumn|fall)\s+wear\b/u.test(ql)) return false;
  const gender = /\b(women'?s|womens|for\s+women|\bwomen\b|men'?s|mens|for\s+men|\bmen\b|kids?\b|boys?\b|girls?\b)/u.test(
    ql,
  );
  const fashionWear = /\bwear\b/u.test(ql) && !/\b(?:hair|eye|foot|face|neck|floor)\s+wear\b/u.test(ql);
  return gender && fashionWear;
}

const GENDER_WEAR_HOME_NEGATIONS = ["candle", "vase", "duvet", "stoneware", "curtain", "cushion", "towel", "homeware"];

/** Hiking / trail / gym + footwear → push correct merch buckets + expansion tokens. */
export function footwearActivityQuery(q: string): boolean {
  const ql = q.trim().toLowerCase();
  const shoeWord = /\b(shoes?|sneakers?|trainers?|footwear|boots?|sandals?|slides?|mules)\b/u.test(ql);
  const activity =
    /\b(trekking|hiking|trail|walking|gym|training|workout|yoga|running|jogging|athletic|sports?)\b/u.test(ql);
  return shoeWord && activity;
}

/** Merge heuristic cues with LLM JSON augment (union negations / expansion; apparel_only OR). */
export function mergeRetailHeuristicsIntoAugment(
  rawQuery: string,
  llm: CsvSearchLlmAugment | null | undefined,
): CsvSearchLlmAugment | null {
  const ql = rawQuery.trim();
  if (!ql) return llm ?? null;

  const party = occasionPartyEveningQuery(ql);
  const coolTrap = stylisticCoolLikely(ql);
  const genderWear = genderFashionWearQuery(ql);
  const footwearAct = footwearActivityQuery(ql);

  if (!party && !coolTrap && !genderWear && !footwearAct) return llm ?? null;

  const out: CsvSearchLlmAugment = { ...(llm ?? {}) };

  if (footwearAct) {
    const slugSet = new Set(out.merchSlugs ?? []);
    if (/\bsandal|\bslide|\bmule\b/u.test(ql)) slugSet.add("footwear_sandals_slides");
    else if (/\bboots?\b/u.test(ql)) slugSet.add("footwear_boots_other");
    else slugSet.add("footwear_sneakers");
    out.merchSlugs = [...slugSet].filter(Boolean).slice(0, 10);
    const extra =
      "hiking shoe trail runner sneaker athletic mesh cushioning grip outdoor breathable durable walking training trek";
    const cur = (out.expandedLexical ?? "").trim();
    out.expandedLexical = [cur, extra].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 400);
  }

  if (genderWear) {
    out.apparelOnly = true;
    const qll = ql.toLowerCase();
    /** Pin corridor from NL so a flaky LLM `gender` field cannot contradict “mens wear …”. */
    if (/\b(men'?s|mens|for\s+men|\bmen\b|\bman\b|\bmale\b)/u.test(qll)) out.gender = "men";
    else if (/\b(women'?s|womens|for\s+women|\bwomen\b|\bladies\b|\blady\b|\bwoman\b)/u.test(qll)) out.gender = "women";
    const namesHome = /\b(?:duvet|curtain|vase|candle|bedding|towel|homeware|stoneware|cushion)\b/u.test(qll);
    if (!namesHome) {
      const neg = new Set([...(out.negatedTerms ?? []), ...GENDER_WEAR_HOME_NEGATIONS]);
      out.negatedTerms = [...neg].slice(0, 14);
    }
    const mentionsStructuredShirt =
      /\b(shirts?|blouses?|button[\s-]down|oxford\s+shirt|woven\s+shirt|polo\b)/u.test(qll) &&
      !/\bdress(?:es)?\b|\bgown\b|\bjumpsuits?\b/u.test(qll);
    const extra = mentionsStructuredShirt
      ? "shirt blouse top tee knit trousers jeans casual polo oxford woven long sleeve men's fit tailored"
      : "shirt blouse top tee dress skirt knitwear outerwear trousers jeans party casual outfit fashion women men";
    const cur = (out.expandedLexical ?? "").trim();
    out.expandedLexical = [cur, extra].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 400);
  }

  if (party) {
    out.apparelOnly = true;
    const extra = heuristicPartyExpandedLexical();
    const cur = (out.expandedLexical ?? "").trim();
    out.expandedLexical = [cur, extra].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 400);
  }

  if (party && coolTrap) {
    const neg = new Set([...(out.negatedTerms ?? []), ...heuristicCoolerCollateralNegations()]);
    out.negatedTerms = [...neg].slice(0, 14);
  }

  const hasSignal =
    out.apparelOnly ||
    (out.expandedLexical?.length ?? 0) > 0 ||
    (out.negatedTerms?.length ?? 0) > 0 ||
    out.gender ||
    (out.merchSlugs?.length ?? 0) > 0 ||
    (out.extraColors?.length ?? 0) > 0;

  return hasSignal ? out : llm ?? null;
}

/** For scoring: crush insulated-lunch homonym when query is party + stylistic "cool". */
export function partyStylisticCoolTrap(queryLower: string): boolean {
  return occasionPartyEveningQuery(queryLower) && stylisticCoolLikely(queryLower);
}
