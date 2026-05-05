import { NextResponse } from "next/server";

import demoCatalog from "@/lib/demo-catalog.json";

export const dynamic = "force-dynamic";

/**
 * Public config hint for the deployment banner (no secrets).
 */
export async function GET() {
  const gw = process.env.COMMERCE_GATEWAY_URL?.trim() ?? "";
  const demo = process.env.SHOWCASE_DEMO_SEARCH === "true";
  const dc = demoCatalog as { products?: unknown[]; buildMeta?: { truncated?: boolean; limitApplied?: number | null } };
  const csvCatalogRows = Array.isArray(dc.products) ? dc.products.length : 0;
  const csvCatalogTruncated = Boolean(dc.buildMeta?.truncated);
  const csvCatalogRowCap = dc.buildMeta?.limitApplied ?? null;

  return NextResponse.json({
    gatewayConfigured: gw.length > 0,
    demoSearchEnabled: demo,
    liveSearchAvailable: gw.length > 0,
    csvCatalogRows,
    csvCatalogTruncated,
    csvCatalogRowCap,
    offlineSearchAvailable: csvCatalogRows > 0,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
