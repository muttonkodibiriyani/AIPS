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
