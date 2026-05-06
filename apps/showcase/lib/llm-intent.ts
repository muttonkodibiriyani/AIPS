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
- apparel_only: true only when they want wearable apparel/footwear and not home décor.
- expanded_keywords: extra EN tokens (synonyms, garment types, fabrics, occasions) not already in the query — space-separated, lowercase, no prices.
- merch_slugs: subset of EXACTLY these tokens only: ${SLUG_LINE}
- colors: extra colour words (lowercase) implied by the query beyond literal tokens.
- negated_terms: lowercase words/phrases they want excluded (e.g. "curtain", "belt").
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

async function callGemini(userQuery: string, signal: AbortSignal): Promise<CsvSearchLlmAugment | null> {
  const key =
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim() || null;
  if (!key) return null;

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();
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

async function callOpenRouter(userQuery: string, signal: AbortSignal): Promise<CsvSearchLlmAugment | null> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim() || null;
  if (!key) return null;

  const model =
    (process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001:free").trim() ||
    "google/gemini-2.0-flash-001:free";
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

/**
 * Calls Gemini (preferred) or OpenRouter when keys exist. Never throws; returns null on failure/timeouts.
 * Disable with SHOWCASE_LLM_INTENT=false.
 */
export async function fetchLlmSearchAugment(query: string): Promise<CsvSearchLlmAugment | null> {
  if (process.env.SHOWCASE_LLM_INTENT === "false") return null;
  const q = query.trim();
  if (q.length < 2) return null;

  const hasGemini = Boolean(
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim(),
  );
  const hasOr = Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());
  if (!hasGemini && !hasOr) return null;

  const ms = Number(process.env.SHOWCASE_LLM_TIMEOUT_MS ?? "10000");
  const timeout = Number.isFinite(ms) && ms >= 2000 && ms <= 25000 ? ms : 10000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);

  try {
    if (hasGemini) {
      const g = await callGemini(q, ctl.signal);
      if (g) return g;
    }
    if (hasOr) return await callOpenRouter(q, ctl.signal);
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
