import { NextResponse } from "next/server";

import type { DemoCatalogFile } from "@/lib/csv-demo-search";
import { searchCsvDemoCatalog } from "@/lib/csv-demo-search";
import { discoveryWeightsFromBody } from "@/lib/discovery-weights";
import { fetchLlmSearchAugmentTeam, fetchLlmSparseSearchSuggestions } from "@/lib/llm-intent";
import { fuseLlmFirstProductRank } from "@/lib/search-fusion";
import demoCatalog from "@/lib/demo-catalog.json";

type ProductCard = Record<string, unknown>;

const csvBundle = demoCatalog as DemoCatalogFile;

type CsvSearchPayload = Record<string, unknown>;

/** Gemini or OpenRouter must be configured for mandatory intent (unless lexical escape hatch). */
function llmKeysConfigured(): boolean {
  return (
    Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim()) ||
    Boolean((process.env.OPENROUTER_API_KEY ?? "").trim())
  );
}

function canCallOutboundLlm(): boolean {
  return process.env.SHOWCASE_LLM_INTENT !== "false" && llmKeysConfigured();
}

type CsvBuildResult =
  | { ok: true; payload: CsvSearchPayload }
  | { ok: false; status: number; body: Record<string, unknown> };

function sparseHintThreshold(): number {
  const raw = parseInt(String(process.env.SHOWCASE_SPARSE_HINT_MIN_RESULTS ?? ""), 10);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 50) return raw;
  return 5;
}

async function withSparseSuggestions(
  query: string,
  sparseLlmEligible: boolean,
  total: number,
  payload: CsvSearchPayload,
): Promise<CsvSearchPayload> {
  const minHits = sparseHintThreshold();
  if (!sparseLlmEligible || total >= minHits) {
    return payload;
  }

  const phrases = await fetchLlmSparseSearchSuggestions(query);
  if (phrases.length === 0) return payload;

  const baseInterp = payload.interpretation;
  const interpretation =
    typeof baseInterp === "object" && baseInterp !== null && !Array.isArray(baseInterp)
      ? { ...baseInterp, llmSparseHints: { applied: true, count: phrases.length, minResults: minHits } }
      : { llmSparseHints: { applied: true, count: phrases.length, minResults: minHits } };

  return {
    ...payload,
    interpretation,
    llmSparseSuggestions: {
      phrases,
      trigger: "few_results",
      minResults: minHits,
    },
  };
}

const LLM_UNAVAIL_MESSAGE =
  "LLM intent could not run (timeouts, quota, or empty model JSON). Retry shortly or widen SHOWCASE_LLM_TIMEOUT_MS.";

/** When strict, every substantive query must yield merged model intent (not just a live HTTP call). */
function assertMandatoryIntentPresent(
  team: Awaited<ReturnType<typeof fetchLlmSearchAugmentTeam>>,
  queryTrimmed: string,
): CsvBuildResult | null {
  const strict = process.env.SHOWCASE_LLM_INTENT_STRICT !== "false";
  if (!strict || queryTrimmed.length < 2) return null;
  if (!canCallOutboundLlm()) return null;
  if (team.merged) return null;

  return {
    ok: false,
    status: 503,
    body: {
      error: "llm_intent_unavailable",
      message: LLM_UNAVAIL_MESSAGE,
      hint: "Set SHOWCASE_ALLOW_LEXICAL_ONLY=true for offline CI, or SHOWCASE_LLM_INTENT_STRICT=false to rank with lexical+heuristic when models fail.",
      products: [],
      facets: {},
      total: 0,
    },
  };
}

async function buildCsvSearchPayload(body: Record<string, unknown>): Promise<CsvBuildResult> {
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "demo-sl";
  const query = typeof body.query === "string" ? body.query : "";
  const discoveryWeights = discoveryWeightsFromBody(body);
  const pagination =
    body.pagination && typeof body.pagination === "object" && body.pagination !== null
      ? (body.pagination as { from?: number; size?: number })
      : {};

  const from = pagination.from ?? 0;
  const size = Math.min(pagination.size ?? 24, 100);

  const outbound = canCallOutboundLlm();

  /** Hybrid LLM+lexical lane: only when outbound LLMs are allowed */
  const fusionEnabled = process.env.SHOWCASE_SEARCH_FUSION !== "false" && outbound;
  const sparseLlmEligible = process.env.SHOWCASE_SPARSE_LLM_HINTS !== "false" && outbound;

  if (!outbound) {
    const r = searchCsvDemoCatalog(csvBundle, query, tenantId, { from, size }, {});
    return {
      ok: true,
      payload: await withSparseSuggestions(query, false, r.total, {
        products: r.products,
        facets: r.facets,
        total: r.total,
        appliedFilters: {
          ...r.appliedFilters,
          hint: "Lexical + deterministic heuristics only (SHOWCASE_ALLOW_LEXICAL_ONLY or no LLM keys). Configure GEMINI_API_KEY or OPENROUTER_API_KEY for mandatory model intent.",
          searchFusion: { attempted: false, applied: false, reason: "llm_disabled_or_no_keys" },
        },
        interpretation: {
          ...discoveryWeights,
          contextualSearchLedByLlm: false,
          llmIntentMandatory: false,
          llmIntentApplied: false,
          llmTeamMembersSucceeded: 0,
          rankingNote:
            "Heuristic + lexical only — set API keys unless SHOWCASE_ALLOW_LEXICAL_ONLY=true intentionally.",
          fusion: false,
        },
      }),
    };
  }

  const llmEnabled = outbound;

  if (fusionEnabled) {
    const capRaw = parseInt(String(process.env.SHOWCASE_SEARCH_FUSE_CAP ?? ""), 10);
    const fuseWindow =
      Number.isFinite(capRaw) && capRaw >= 80 && capRaw <= 2000 ? capRaw : Math.min(380, Math.max(size * 14, 160));

    const [team, lexWide] = await Promise.all([
      fetchLlmSearchAugmentTeam(query),
      Promise.resolve(searchCsvDemoCatalog(csvBundle, query, tenantId, { from: 0, size: fuseWindow }, {})),
    ]);

    const block = assertMandatoryIntentPresent(team, query.trim());
    if (block) return block;

    const merged = team.merged;
    if (!merged) {
      const r = searchCsvDemoCatalog(csvBundle, query, tenantId, { from, size }, {});
      return {
        ok: true,
        payload: await withSparseSuggestions(query, sparseLlmEligible, r.total, {
          products: r.products,
          facets: r.facets,
          total: r.total,
          appliedFilters: {
            ...r.appliedFilters,
            hint: "CSV catalog (apps/showcase/data/catalog.csv or .csv.gz → prebuild). Large files are capped at build time — use ingest + COMMERCE_GATEWAY_URL for the full multimillion-SKU corpus with BM25/ANN.",
            searchFusion: {
              attempted: true,
              applied: false,
              fuseWindow,
              llmTeamMembersSucceeded: team.memberCount,
              llmParallel: team.parallel,
              reason: "intent_unavailable_non_strict",
            },
          },
          interpretation: {
            ...discoveryWeights,
            contextualSearchLedByLlm: false,
            llmIntentMandatory: false,
            rankingNote:
              "Fusion lane fell back to lexical — model returned no mergeable JSON (SHOWCASE_LLM_INTENT_STRICT=false).",
            fusion: false,
            llmLexicalLanePriority: false,
            llmIntentAttempted: llmEnabled,
            llmIntentApplied: false,
            llmTeamMembersSucceeded: team.memberCount,
            llmParallel: team.parallel,
          },
        }),
      };
    }

    const llmWide = searchCsvDemoCatalog(csvBundle, query, tenantId, { from: 0, size: fuseWindow }, {
      llmAugment: merged,
    });

    const fusedList = fuseLlmFirstProductRank(llmWide.products, lexWide.products);
    const products = fusedList.slice(from, from + size);

    return {
      ok: true,
      payload: await withSparseSuggestions(query, sparseLlmEligible, fusedList.length, {
        products,
        facets: llmWide.facets,
        total: fusedList.length,
        appliedFilters: {
          ...llmWide.appliedFilters,
          hint: "CSV catalog (apps/showcase/data/catalog.csv → build). Large files are capped at build time — use ingest + COMMERCE_GATEWAY_URL for the full multimillion-SKU corpus with BM25/ANN.",
          searchFusion: {
            attempted: true,
            applied: true,
            fuseWindow,
            llmLaneHits: llmWide.products.length,
            lexicalLaneHits: lexWide.products.length,
            fusedUnique: fusedList.length,
            llmTeamMembersSucceeded: team.memberCount,
            llmParallel: team.parallel,
          },
        },
        interpretation: {
          ...discoveryWeights,
          contextualSearchLedByLlm: true,
          fusion: true,
          llmIntentMandatory: true,
          llmLexicalLanePriority: true,
          pureLexicalLaneMerged: true,
          rankingNote:
            "Contextual-first: model intent + deterministic heuristics fused into lexical scores; lexical tail merged.",
          llmIntentAttempted: llmEnabled,
          llmIntentApplied: true,
          llmTeamMembersSucceeded: team.memberCount,
          llmParallel: team.parallel,
        },
      }),
    };
  }

  const team = await fetchLlmSearchAugmentTeam(query);

  const block = assertMandatoryIntentPresent(team, query.trim());
  if (block) return block;

  const r = searchCsvDemoCatalog(csvBundle, query, tenantId, { from, size }, {
    llmAugment: team.merged ?? undefined,
  });

  return {
    ok: true,
    payload: await withSparseSuggestions(query, sparseLlmEligible, r.total, {
      products: r.products,
      facets: r.facets,
      total: r.total,
      appliedFilters: {
        ...r.appliedFilters,
        hint: "CSV catalog (apps/showcase/data/catalog.csv → build). Large files are capped at build time — use ingest + COMMERCE_GATEWAY_URL for the full multimillion-SKU corpus with BM25/ANN.",
        searchFusion: { attempted: false, applied: false, reason: "fusion_disabled" },
      },
      interpretation: {
        ...discoveryWeights,
        contextualSearchLedByLlm: Boolean(team.merged),
        llmIntentMandatory: outbound,
        fusion: false,
        rankingNote: team.merged
          ? "Model intent merged into lexical + heuristic scorer (fusion off)."
          : "Lexical + heuristics only — model returned empty JSON.",
        llmLexicalLanePriority: Boolean(team.merged),
        llmIntentAttempted: llmEnabled,
        llmIntentApplied: Boolean(team.merged),
        llmTeamMembersSucceeded: team.memberCount,
        llmParallel: team.parallel,
      },
    }),
  };
}

function buildMockSearchPayload(body: Record<string, unknown>): CsvSearchPayload {
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "demo-sl";
  const query = typeof body.query === "string" ? body.query : "";
  const discoveryWeights = discoveryWeightsFromBody(body);
  const q = query.toLowerCase();

  const all: ProductCard[] = [
    {
      title: { en: "Organic cotton duvet cover · ivory queen", ar: "غطاء لحاف قطن عضوي عاجي" },
      sku: "HOM-DUV-IVORY-Q",
      product_id: "HOM-DUV-IVORY-Q",
      market: "AE",
      images: [],
      availability: true,
      pricing: { aed: 349 },
      _score: 18.2,
    },
    {
      title: {
        en: "Stoneware vase · minimalist white glaze",
        ar: "مزهرية خزف حجر أبيض",
      },
      sku: "DEC-VASE-STNE-WHT",
      product_id: "DEC-VASE-STNE-WHT",
      market: "AE",
      images: [],
      availability: true,
      pricing: { aed: 189 },
      _score: 16.9,
    },
    {
      title: { en: "Denim jacket · men's M · indigo wash", ar: "جاكيت جينز رجالي" },
      sku: "APP-JKT-DNM-M",
      product_id: "APP-JKT-DNM-M",
      market: "SA",
      images: [],
      availability: true,
      pricing: { sar: 399 },
      _score: 15.4,
    },
    {
      title: { en: "Leather crossbody · compact black", ar: "حقيبة جلدية سوداء" },
      sku: "ACC-BAG-LTH-BLK",
      product_id: "ACC-BAG-LTH-BLK",
      market: "AE",
      images: [],
      availability: false,
      pricing: { aed: 459 },
      _score: 14.8,
    },
  ];

  const products =
    q.length < 2
      ? all
      : all.filter((p) => {
          const titles = typeof p.title === "object" && p.title !== null ? (p.title as Record<string, string>) : {};
          const hay = `${titles.en ?? ""} ${titles.ar ?? ""} ${String(p.sku ?? "")}`.toLowerCase();
          return hay.includes(q) || /\b(blank|anything|everything|catalog|sku)\b/i.test(query);
        });

  return {
    products,
    facets: {
      colors: [
        { key: "white", count: 2 },
        { key: "blue", count: 1 },
        { key: "black", count: 1 },
      ],
      markets: [
        { key: "AE", count: 3 },
        { key: "SA", count: 1 },
      ],
    },
    total: products.length,
    appliedFilters: {
      _demo_stub_: true,
      tenantId,
      hint: "Hardcoded stub. Add apps/showcase/data/catalog.csv or COMMERCE_GATEWAY_URL for real data.",
    },
    interpretation: {
      ...discoveryWeights,
      contextualSearchLedByLlm: false,
      fusion: false,
      rankingNote: "Stub grid — use catalog or gateway for AI search.",
    },
  };
}

export async function POST(req: Request) {
  const baseRaw = process.env.COMMERCE_GATEWAY_URL;
  const demoStub = process.env.SHOWCASE_DEMO_SEARCH === "true";
  const csvRows = csvBundle.products?.length ?? 0;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const base = typeof baseRaw === "string" ? baseRaw.trim() : "";
  const allowLexicalOnly = process.env.SHOWCASE_ALLOW_LEXICAL_ONLY === "true";

  if (!base && csvRows > 0 && !allowLexicalOnly && !canCallOutboundLlm()) {
    return NextResponse.json(
      {
        error: "llm_intent_required",
        message:
          "Model intent is required for CSV demo search: set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY or OPENROUTER_API_KEY on the server.",
        hint: "Local/CI without keys: set SHOWCASE_ALLOW_LEXICAL_ONLY=true in env.",
        products: [],
        facets: {},
        total: 0,
      },
      { status: 503 },
    );
  }

  if (!base) {
    if (csvRows > 0) {
      const t0 = Date.now();
      const built = await buildCsvSearchPayload(body);
      if (!built.ok) {
        return NextResponse.json(
          { ...built.body, meta: { serverLatencyMs: Date.now() - t0, path: "csv_catalog_intent_blocked" } },
          { status: built.status },
        );
      }
      const serverLatencyMs = Date.now() - t0;
      return NextResponse.json({ ...built.payload, meta: { serverLatencyMs, path: "csv_catalog" } });
    }
    if (demoStub) {
      const t0 = Date.now();
      const payload = buildMockSearchPayload(body);
      const serverLatencyMs = Date.now() - t0;
      return NextResponse.json({ ...payload, meta: { serverLatencyMs, path: "demo_stub" } });
    }
    return NextResponse.json(
      {
        error: "demo_unconfigured",
        message:
          "Add product rows under apps/showcase/data/ (catalog.csv, catalog.csv.gz, or SHOWCASE_CATALOG_CSV), deploy, or set SHOWCASE_DEMO_SEARCH=true, or configure COMMERCE_GATEWAY_URL.",
        products: [],
        facets: {},
        total: 0,
      },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const key = process.env.COMMERCE_API_KEY ?? process.env.SHOWCASE_API_FALLBACK ?? "pk_demo";
  headers.Authorization = `Bearer ${key}`;

  const stripped = base.replace(/\/$/, "");

  const t0 = Date.now();
  try {
    const upstream = await fetch(`${stripped}/v1/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      next: { revalidate: 0 },
    });

    const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    const serverLatencyMs = Date.now() - t0;
    return NextResponse.json({
      ...payload,
      meta: {
        ...(typeof payload.meta === "object" && payload.meta !== null ? (payload.meta as object) : {}),
        serverLatencyMs,
        upstreamStatus: upstream.status,
        path: "gateway",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upstream_error";
    return NextResponse.json({ error: "gateway_unreachable", message: msg, products: [] }, { status: 502 });
  }
}
