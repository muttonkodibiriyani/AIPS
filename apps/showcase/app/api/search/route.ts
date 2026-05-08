import { NextResponse } from "next/server";

import type { DemoCatalogFile } from "@/lib/csv-demo-search";
import { searchCsvDemoCatalog } from "@/lib/csv-demo-search";
import { fetchLlmSearchAugmentTeam, fetchLlmSparseSearchSuggestions } from "@/lib/llm-intent";
import { fuseLlmFirstProductRank } from "@/lib/search-fusion";
import demoCatalog from "@/lib/demo-catalog.json";

type ProductCard = Record<string, unknown>;

const csvBundle = demoCatalog as DemoCatalogFile;

type CsvSearchPayload = Record<string, unknown>;

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

async function buildCsvSearchPayload(body: Record<string, unknown>): Promise<CsvSearchPayload> {
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "demo-sl";
  const query = typeof body.query === "string" ? body.query : "";
  const pagination =
    body.pagination && typeof body.pagination === "object" && body.pagination !== null
      ? (body.pagination as { from?: number; size?: number })
      : {};

  const from = pagination.from ?? 0;
  const size = Math.min(pagination.size ?? 24, 100);

  const llmKeysConfigured =
    Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim()) ||
    Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());

  const llmEnabled = process.env.SHOWCASE_LLM_INTENT !== "false" && llmKeysConfigured;
  const sparseLlmEligible = process.env.SHOWCASE_SPARSE_LLM_HINTS !== "false" && llmKeysConfigured;

  const fusionEnabled = process.env.SHOWCASE_SEARCH_FUSION !== "false" && llmEnabled;

  if (fusionEnabled) {
    const capRaw = parseInt(String(process.env.SHOWCASE_SEARCH_FUSE_CAP ?? ""), 10);
    const fuseWindow =
      Number.isFinite(capRaw) && capRaw >= 80 && capRaw <= 2000 ? capRaw : Math.min(380, Math.max(size * 14, 160));

    const [team, lexWide] = await Promise.all([
      fetchLlmSearchAugmentTeam(query),
      Promise.resolve(searchCsvDemoCatalog(csvBundle, query, tenantId, { from: 0, size: fuseWindow }, {})),
    ]);

    const merged = team.merged;

    if (!merged) {
      const r = searchCsvDemoCatalog(csvBundle, query, tenantId, { from, size }, {});
      return withSparseSuggestions(query, sparseLlmEligible, r.total, {
        products: r.products,
        facets: r.facets,
        total: r.total,
        appliedFilters: {
          ...r.appliedFilters,
          hint: "CSV catalog (apps/showcase/data/catalog.csv → build). Large files are capped at build time — use ingest + COMMERCE_GATEWAY_URL for the full multimillion-SKU corpus with BM25/ANN.",
          searchFusion: {
            attempted: true,
            applied: false,
            fuseWindow,
            llmTeamMembersSucceeded: team.memberCount,
            llmParallel: team.parallel,
            reason: "intent_unavailable",
          },
        },
        interpretation: {
          lexicalWeight: 1,
          semanticWeight: 0,
          fusion: false,
          llmLexicalLanePriority: false,
          llmIntentAttempted: llmEnabled,
          llmIntentApplied: false,
          llmTeamMembersSucceeded: team.memberCount,
          llmParallel: team.parallel,
        },
      });
    }

    const llmWide = searchCsvDemoCatalog(csvBundle, query, tenantId, { from: 0, size: fuseWindow }, {
      llmAugment: merged,
    });

    const fusedList = fuseLlmFirstProductRank(llmWide.products, lexWide.products);
    const products = fusedList.slice(from, from + size);

    return withSparseSuggestions(query, sparseLlmEligible, fusedList.length, {
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
        lexicalWeight: 0.55,
        semanticWeight: 0,
        fusion: true,
        llmLexicalLanePriority: true,
        pureLexicalLaneMerged: true,
        llmIntentAttempted: llmEnabled,
        llmIntentApplied: true,
        llmTeamMembersSucceeded: team.memberCount,
        llmParallel: team.parallel,
      },
    });
  }

  const team = await fetchLlmSearchAugmentTeam(query);
  const r = searchCsvDemoCatalog(csvBundle, query, tenantId, { from, size }, {
    llmAugment: team.merged ?? undefined,
  });

  return withSparseSuggestions(query, sparseLlmEligible, r.total, {
    products: r.products,
    facets: r.facets,
    total: r.total,
    appliedFilters: {
      ...r.appliedFilters,
      hint: "CSV catalog (apps/showcase/data/catalog.csv → build). Large files are capped at build time — use ingest + COMMERCE_GATEWAY_URL for the full multimillion-SKU corpus with BM25/ANN.",
      searchFusion: { attempted: false, applied: false, reason: "fusion_disabled" },
    },
    interpretation: {
      lexicalWeight: 1,
      semanticWeight: 0,
      fusion: false,
      llmLexicalLanePriority: Boolean(team.merged),
      llmIntentAttempted: llmEnabled,
      llmIntentApplied: Boolean(team.merged),
      llmTeamMembersSucceeded: team.memberCount,
      llmParallel: team.parallel,
    },
  });
}

function buildMockSearchPayload(body: Record<string, unknown>): CsvSearchPayload {
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "demo-sl";
  const query = typeof body.query === "string" ? body.query : "";
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
    interpretation: { lexicalWeight: 1, semanticWeight: 0 },
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

  if (!base) {
    if (csvRows > 0) {
      const t0 = Date.now();
      const payload = await buildCsvSearchPayload(body);
      const serverLatencyMs = Date.now() - t0;
      return NextResponse.json({ ...payload, meta: { serverLatencyMs, path: "csv_catalog" } });
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
          "Add product rows to apps/showcase/data/catalog.csv (commit + redeploy), or set SHOWCASE_DEMO_SEARCH=true, or configure COMMERCE_GATEWAY_URL.",
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
