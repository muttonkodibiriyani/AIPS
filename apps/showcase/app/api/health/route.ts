import { NextResponse } from "next/server";

import demoCatalog from "@/lib/demo-catalog.json";

export const dynamic = "force-dynamic";

/**
 * Public config hint for the deployment banner (no secrets).
 */
export async function GET() {
  const gw = process.env.COMMERCE_GATEWAY_URL?.trim() ?? "";
  const demo = process.env.SHOWCASE_DEMO_SEARCH === "true";
  const csvCatalogRows = Array.isArray((demoCatalog as { products?: unknown[] }).products)
    ? (demoCatalog as { products: unknown[] }).products.length
    : 0;

  return NextResponse.json({
    gatewayConfigured: gw.length > 0,
    demoSearchEnabled: demo,
    liveSearchAvailable: gw.length > 0,
    csvCatalogRows,
    offlineSearchAvailable: csvCatalogRows > 0,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
