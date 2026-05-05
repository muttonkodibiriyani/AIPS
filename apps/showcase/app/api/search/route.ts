import { NextResponse } from "next/server";

import type { DemoCatalogFile } from "@/lib/csv-demo-search";
import { searchCsvDemoCatalog } from "@/lib/csv-demo-search";
import demoCatalog from "@/lib/demo-catalog.json";

type ProductCard = Record<string, unknown>;

const csvBundle = demoCatalog as DemoCatalogFile;

function csvSearchResponse(body: Record<string, unknown>) {
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "demo-sl";
  const query = typeof body.query === "string" ? body.query : "";
  const pagination =
    body.pagination && typeof body.pagination === "object" && body.pagination !== null
      ? (body.pagination as { from?: number; size?: number })
      : {};

  const r = searchCsvDemoCatalog(csvBundle, query, tenantId, pagination);
  return NextResponse.json({
    products: r.products,
    facets: r.facets,
    total: r.total,
    appliedFilters: {
      ...r.appliedFilters,
      hint: "CSV catalog (apps/showcase/data/catalog.csv → build). Set COMMERCE_GATEWAY_URL for live API.",
    },
    interpretation: { lexicalWeight: 1, semanticWeight: 0 },
  });
}

/**
 * Offline / stub payload when COMMERCE_GATEWAY_URL is unset and SHOWCASE_DEMO_SEARCH=true and no CSV rows.
 */
function mockSearchResponse(body: Record<string, unknown>) {
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

  return NextResponse.json({
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
  });
}

/**
 * Server-side proxy: keeps COMMERCE_API_KEY off the browser bundle.
 * Without gateway: prefers CSV-generated catalog (`prebuild`), then SHOWCASE_DEMO_SEARCH stub.
 */
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
      return csvSearchResponse(body);
    }
    if (demoStub) {
      return mockSearchResponse(body);
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

  try {
    const upstream = await fetch(`${stripped}/v1/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      next: { revalidate: 0 },
    });

    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upstream_error";
    return NextResponse.json({ error: "gateway_unreachable", message: msg, products: [] }, { status: 502 });
  }
}
