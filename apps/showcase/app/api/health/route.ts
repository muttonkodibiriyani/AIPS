import { NextResponse } from "next/server";

import demoCatalog from "@/lib/demo-catalog.json";

export const dynamic = "force-dynamic";

/**
 * Public config hint for the deployment banner (no secrets).
 */
export async function GET() {
  const gw = process.env.COMMERCE_GATEWAY_URL?.trim() ?? "";
  const demo = process.env.SHOWCASE_DEMO_SEARCH === "true";
  const allowLexicalOnly = process.env.SHOWCASE_ALLOW_LEXICAL_ONLY === "true";
  const llmIntentStrict = process.env.SHOWCASE_LLM_INTENT_STRICT !== "false";
  const dc = demoCatalog as {
    products?: unknown[];
    buildMeta?: {
      truncated?: boolean;
      limitApplied?: number | null;
      segment?: string;
      segmentUnderfilled?: boolean;
      reservoirSampling?: boolean;
    };
  };
  const csvCatalogRows = Array.isArray(dc.products) ? dc.products.length : 0;
  const csvCatalogTruncated = Boolean(dc.buildMeta?.truncated);
  const csvCatalogRowCap = dc.buildMeta?.limitApplied ?? null;
  const csvCatalogSegment = dc.buildMeta?.segment ?? null;

  const llmIntentConfigured =
    process.env.SHOWCASE_LLM_INTENT !== "false" &&
    (Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim()) ||
      Boolean((process.env.OPENROUTER_API_KEY ?? "").trim()));
  /** Mirrors /api/search CSV gate: POST returns 503 without keys unless SHOWCASE_ALLOW_LEXICAL_ONLY. */
  const csvLlmIntentRequired =
    gw.length === 0 && csvCatalogRows > 0 && !allowLexicalOnly && !llmIntentConfigured;
  return NextResponse.json({
    gatewayConfigured: gw.length > 0,
    demoSearchEnabled: demo,
    liveSearchAvailable: gw.length > 0,
    csvCatalogRows,
    csvCatalogTruncated,
    csvCatalogRowCap,
    csvCatalogSegment,
    offlineSearchAvailable: csvCatalogRows > 0,
    llmIntentConfigured,
    allowLexicalOnly,
    llmIntentStrict,
    csvLlmIntentRequired,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
