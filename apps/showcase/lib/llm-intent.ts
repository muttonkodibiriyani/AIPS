import type { CsvSearchLlmAugment } from "./csv-demo-search";
import { DEMO_MERCH_RETRIEVAL_SLUGS } from "./csv-demo-search";

const SLUG_LINE = DEMO_MERCH_RETRIEVAL_SLUGS.join(", ");

const SYSTEM_PREFIX = `You classify retail product search queries for an offline lexical catalog.
Return ONE JSON object only — no markdown fences, no commentary.
Schema:
{
  "gender": null | "men" | "women" | "kids",
  "apparel_only": boolean,
  "expanded_keywords": string,
  "merch_slugs": string[],
  "colors": string[],
  "negated_terms": string[]
}

Rules:
- gender: null unless the shopper clearly targets a segment.
- apparel_only: true when they want wearable fashion (tops, bottoms, shoes, accessories worn on the body)—including phrases like "summer collection for men/women", "new season for men", seasonal edits/lookbooks **unless** they mention home/bedding (duvet, sheets, curtains, cushions, towels, vases).
- expanded_keywords: extra EN tokens (synonyms, garment types, fabrics, occasions) not already in the query — space-separated, lowercase, no prices.
- merch_slugs: subset of EXACTLY these tokens only: ${SLUG_LINE}
- colors: extra colour words (lowercase) implied by the query beyond literal tokens.
- negated_terms: lowercase words/phrases they want excluded (e.g. "curtain", "belt").
- Homonym guard: English "cool" often means stylish ("looks cool", "something cool") NOT "cool bag" / insulated lunch cooler. When the shopper is asking for apparel (party wear, going-out, cocktail, gala, dresses) and uses "cool" in that slang sense, you MUST populate negated_terms with at least "cool bag", "lunch bag", "insulated", "cooler".
`;

function stripCodeFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  }
  return s;
}

function isGender(x: unknown): x is "men" | "women" | "kids" {
  return x === "men" || x === "women" || x === "kids";
}

const SLUG_SET = new Set<string>(DEMO_MERCH_RETRIEVAL_SLUGS);

/** Maps free-form model output into merge-safe augment fields; returns null if unusable. */
export function llmAugmentFromJson(parsed: unknown): CsvSearchLlmAugment | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const out: CsvSearchLlmAugment = {};

  if ("gender" in o && isGender(o.gender)) out.gender = o.gender;
  if (typeof o.apparel_only === "boolean") out.apparelOnly = o.apparel_only;

  const kw = o.expanded_keywords;
  if (typeof kw === "string" && kw.trim()) {
    out.expandedLexical = kw.trim().slice(0, 400);
  }

  const mc = o.merch_slugs;
  if (Array.isArray(mc)) {
    const merchSlugs = mc
      .map((x) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, "_"))
      .filter((x) => SLUG_SET.has(x));
    if (merchSlugs.length) out.merchSlugs = [...new Set(merchSlugs)].slice(0, 8);
  }

  const cols = o.colors;
  if (Array.isArray(cols)) {
    const extraColors = cols
      .map((x) => String(x ?? "").trim().toLowerCase())
      .filter((x) => x.length >= 3 && x.length <= 24);
    if (extraColors.length) out.extraColors = [...new Set(extraColors)].slice(0, 8);
  }

  const neg = o.negated_terms;
  if (Array.isArray(neg)) {
    const negatedTerms = neg
      .map((x) => String(x ?? "").trim().toLowerCase())
      .filter((x) => x.length >= 3 && x.length <= 48);
    if (negatedTerms.length) out.negatedTerms = [...new Set(negatedTerms)].slice(0, 12);
  }

  if (
    out.gender ||
    out.apparelOnly ||
    out.expandedLexical ||
    (out.merchSlugs?.length ?? 0) > 0 ||
    (out.extraColors?.length ?? 0) > 0 ||
    (out.negatedTerms?.length ?? 0) > 0
  ) {
    return out;
  }
  return null;
}

function parseModelJson(text: string): CsvSearchLlmAugment | null {
  try {
    const stripped = stripCodeFence(text);
    return llmAugmentFromJson(JSON.parse(stripped));
  } catch {
    return null;
  }
}

function tokenUnion(...phrases: (string | undefined)[]): string | undefined {
  const s = new Set<string>();
  for (const ph of phrases) {
    if (!ph) continue;
    for (const t of ph.trim().split(/\s+/)) {
      if (t.length) s.add(t);
    }
  }
  const joined = [...s].slice(0, 80).join(" ");
  return joined.length ? joined : undefined;
}

/** Merge intents from parallel models (Gemini family + OpenRouter). Earlier entries win conflicting `gender`. */
export function mergeLlmAugments(ordered: readonly CsvSearchLlmAugment[]): CsvSearchLlmAugment | null {
  const parts = ordered.filter(Boolean);
  if (parts.length === 0) return null;

  const out: CsvSearchLlmAugment = {};

  for (const p of parts) {
    if (p.gender && !out.gender) out.gender = p.gender;
    if (p.apparelOnly) out.apparelOnly = true;
  }

  const ex = tokenUnion(...parts.map((p) => p.expandedLexical));
  if (ex) out.expandedLexical = ex.slice(0, 400);

  const merch = new Set<string>();
  const colors = new Set<string>();
  const neg = new Set<string>();
  for (const p of parts) {
    for (const x of p.merchSlugs ?? []) merch.add(x);
    for (const x of p.extraColors ?? []) colors.add(x);
    for (const x of p.negatedTerms ?? []) neg.add(x);
  }
  if (merch.size) out.merchSlugs = [...merch].slice(0, 10);
  if (colors.size) out.extraColors = [...colors].slice(0, 10);
  if (neg.size) out.negatedTerms = [...neg].slice(0, 14);

  return llmAugmentFromJson({
    gender: out.gender ?? null,
    apparel_only: out.apparelOnly ?? false,
    expanded_keywords: out.expandedLexical ?? "",
    merch_slugs: out.merchSlugs ?? [],
    colors: out.extraColors ?? [],
    negated_terms: out.negatedTerms ?? [],
  });
}

async function callGeminiWithModel(
  userQuery: string,
  model: string,
  signal: AbortSignal,
): Promise<CsvSearchLlmAugment | null> {
  const key =
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim() || null;
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [
      {
        parts: [{ text: `${SYSTEM_PREFIX}\n\nShopper query:\n${userQuery}` }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return null;
  return parseModelJson(text);
}

async function callGemini(userQuery: string, signal: AbortSignal): Promise<CsvSearchLlmAugment | null> {
  const model = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();
  return callGeminiWithModel(userQuery, model, signal);
}

async function callOpenRouterWithModel(
  userQuery: string,
  model: string,
  signal: AbortSignal,
): Promise<CsvSearchLlmAugment | null> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim() || null;
  if (!key || !model.trim()) return null;

  const referer = (process.env.OPENROUTER_HTTP_REFERRER ?? "https://commerce-ai-showcase.local").trim();

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": referer,
      "X-Title": "Commerce AI Showcase",
    },
    body: JSON.stringify({
      model: model.trim(),
      temperature: 0.1,
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PREFIX },
        { role: "user", content: userQuery },
      ],
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  return parseModelJson(text);
}

async function callOpenRouter(userQuery: string, signal: AbortSignal): Promise<CsvSearchLlmAugment | null> {
  const model =
    (process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001:free").trim() ||
    "google/gemini-2.0-flash-001:free";
  return callOpenRouterWithModel(userQuery, model, signal);
}

export type LlmTeamResult = {
  merged: CsvSearchLlmAugment | null;
  /** Non-null partial intents collected before merge */
  memberCount: number;
  parallel: boolean;
};

/**
 * Runs multiple intent extractors in parallel when enabled (Gemini primary, optional `GEMINI_TEAM_MODEL_SECOND`,
 * OpenRouter plus optional `OPENROUTER_MODEL_SECOND`). Merges JSON cues so offline lexical search gets a richer, consensus-style augment.
 *
 * Use OpenRouter model slugs for extra providers (e.g. `deepseek/deepseek-chat`, `anthropic/claude-3-haiku`): set `OPENROUTER_MODEL` / `OPENROUTER_MODEL_SECOND`.
 *
 * `SHOWCASE_LLM_PARALLEL=false` → sequential Gemini then OpenRouter (fewer concurrent API calls).
 */
export async function fetchLlmSearchAugmentTeam(query: string): Promise<LlmTeamResult> {
  if (process.env.SHOWCASE_LLM_INTENT === "false") {
    return { merged: null, memberCount: 0, parallel: false };
  }
  const q = query.trim();
  if (q.length < 2) return { merged: null, memberCount: 0, parallel: false };

  const hasGemini = Boolean(
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim(),
  );
  const hasOr = Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());
  if (!hasGemini && !hasOr) return { merged: null, memberCount: 0, parallel: false };

  const ms = Number(process.env.SHOWCASE_LLM_TIMEOUT_MS ?? "10000");
  const timeout = Number.isFinite(ms) && ms >= 2000 && ms <= 25000 ? ms : 10000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);

  const parallelOn = process.env.SHOWCASE_LLM_PARALLEL !== "false";
  const secondaryModel = (process.env.GEMINI_TEAM_MODEL_SECOND ?? "").trim();
  const openRouterSecond = (process.env.OPENROUTER_MODEL_SECOND ?? "").trim();

  try {
    if (!parallelOn) {
      if (hasGemini) {
        const g = await callGemini(q, ctl.signal);
        if (g) return { merged: g, memberCount: 1, parallel: false };
      }
      if (hasOr) {
        const o = await callOpenRouter(q, ctl.signal);
        return { merged: o, memberCount: o ? 1 : 0, parallel: false };
      }
      return { merged: null, memberCount: 0, parallel: false };
    }

    const tasks: Promise<CsvSearchLlmAugment | null>[] = [];
    if (hasGemini) {
      tasks.push(callGemini(q, ctl.signal));
      if (secondaryModel) tasks.push(callGeminiWithModel(q, secondaryModel, ctl.signal));
    }
    if (hasOr) {
      tasks.push(callOpenRouter(q, ctl.signal));
      if (openRouterSecond) tasks.push(callOpenRouterWithModel(q, openRouterSecond, ctl.signal));
    }

    if (tasks.length === 0) return { merged: null, memberCount: 0, parallel: true };

    const chunk = await Promise.all(
      tasks.map((p) =>
        p.catch((): CsvSearchLlmAugment | null => null),
      ),
    );
    const ok = chunk.filter((x): x is CsvSearchLlmAugment => x != null);
    const merged = mergeLlmAugments(ok);
    return { merged, memberCount: ok.length, parallel: true };
  } catch {
    return { merged: null, memberCount: 0, parallel: parallelOn };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Back-compat: same as `fetchLlmSearchAugmentTeam` then returns merged intent only.
 */
export async function fetchLlmSearchAugment(query: string): Promise<CsvSearchLlmAugment | null> {
  const r = await fetchLlmSearchAugmentTeam(query);
  return r.merged;
}

/** Pattern from sparse-result LLM query expansion (e‑com search UX): suggest concrete follow-up searches. */
const SPARSE_SUGGESTIONS_SYSTEM = `You help shoppers search a broad fashion + home e‑commerce catalog (English product titles).
Lexical search returned very few or zero useful matches for their vague or indirect wording.

Return ONE JSON object only — no markdown, no commentary.
Schema: { "queries": string[] }

Rules:
- Provide exactly 5 distinct strings (each roughly 3–12 words unless the shopper was extremely short).
- Each string must read like something a shopper would paste into the product search box (concrete product types, fabrics, silhouettes).
- Prefer mass‑market wording that could match realistic SKUs. Do not invent proprietary brand names or celebrity labels.
- Diversify intents (different product angles), grounded in plausible interpretations of what they might mean.
- If the shopper hinted a gender, corridor, colour, budget, room, or season, honour that when relevant.
- Do not mirror the shopper's exact verbatim query more than once in the five strings; paraphrase and specialize.
`;

type SuggestCacheEntry = { expiresAt: number; phrases: string[] };
const sparseSuggestCache = new Map<string, SuggestCacheEntry>();

function sparseSuggestCacheKey(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function sparseSuggestCacheTtlMs(): number {
  const raw = parseInt(String(process.env.SHOWCASE_LLM_SUGGEST_CACHE_TTL_MS ?? ""), 10);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 86_400_000) return raw;
  return 120_000;
}

/** Validates model JSON `{ "queries": [...] }` into display-safe search strings. */
export function sparseQueriesFromModelJson(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const o = parsed as Record<string, unknown>;
  const arr = o.queries;
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const x of arr) {
    const s = String(x ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (s.length >= 4 && s.length <= 140) out.push(s);
  }
  return dedupeSparsePhrases(out).slice(0, 5);
}

function dedupeSparsePhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phrases) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function parseSparseSuggestionsFromText(text: string): string[] {
  try {
    const stripped = stripCodeFence(text);
    return sparseQueriesFromModelJson(JSON.parse(stripped));
  } catch {
    return [];
  }
}

function filterAgainstOriginal(query: string, phrases: string[]): string[] {
  const qNorm = query.trim().toLowerCase().replace(/\s+/g, " ");
  return phrases.filter((p) => p.trim().toLowerCase().replace(/\s+/g, " ") !== qNorm);
}

async function callGeminiSparseSuggestions(userQuery: string, signal: AbortSignal): Promise<string[]> {
  const key =
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim() || null;
  if (!key) return [];

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${SPARSE_SUGGESTIONS_SYSTEM}\n\nShopper search box text:\n${userQuery}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 280,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return [];

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return [];
  return parseSparseSuggestionsFromText(text);
}

async function callOpenRouterSparseSuggestions(userQuery: string, signal: AbortSignal): Promise<string[]> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim() || null;
  if (!key) return [];

  const model =
    (process.env.OPENROUTER_SPARSE_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001:free")
      .trim() || "google/gemini-2.0-flash-001:free";
  const referer = (process.env.OPENROUTER_HTTP_REFERRER ?? "https://commerce-ai-showcase.local").trim();

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": referer,
      "X-Title": "Commerce AI Showcase",
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      max_tokens: 280,
      messages: [
        { role: "system", content: SPARSE_SUGGESTIONS_SYSTEM },
        { role: "user", content: userQuery },
      ],
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) return [];

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return [];
  return parseSparseSuggestionsFromText(text);
}

/**
 * When lexical search returns too few hits, generate alternative search phrases (Medium-style “LLM suggestions” pattern).
 * Uses a short-lived in-process cache; set `SHOWCASE_LLM_SUGGEST_CACHE_TTL_MS=0` to disable caching.
 */
export async function fetchLlmSparseSearchSuggestions(query: string): Promise<string[]> {
  if (process.env.SHOWCASE_SPARSE_LLM_HINTS === "false") return [];
  const q = query.trim();
  if (q.length < 3) return [];

  const hasGemini = Boolean(
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim(),
  );
  const hasOr = Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());
  if (!hasGemini && !hasOr) return [];

  const cacheKey = sparseSuggestCacheKey(q);
  const ttl = sparseSuggestCacheTtlMs();
  if (ttl > 0) {
    const hit = sparseSuggestCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.phrases;
  }

  const ms = Number(process.env.SHOWCASE_LLM_TIMEOUT_MS ?? "10000");
  const timeout = Number.isFinite(ms) && ms >= 2000 && ms <= 25000 ? ms : 10000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);

  try {
    let phrases: string[] = [];
    if (hasGemini) {
      phrases = await callGeminiSparseSuggestions(q, ctl.signal);
    }
    if (phrases.length === 0 && hasOr) {
      phrases = await callOpenRouterSparseSuggestions(q, ctl.signal);
    }
    phrases = filterAgainstOriginal(q, dedupeSparsePhrases(phrases)).slice(0, 5);
    if (ttl > 0 && phrases.length > 0) {
      sparseSuggestCache.set(cacheKey, { expiresAt: Date.now() + ttl, phrases });
    }
    return phrases;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
