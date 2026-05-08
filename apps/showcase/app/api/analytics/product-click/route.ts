import { NextResponse } from "next/server";

import { allowQueryTextInAnalytics, emitShowcaseAnalytics } from "@/lib/analytics-sink";

type ClickBody = {
  sessionId?: string;
  tenantId?: string;
  sku?: string;
  productId?: string;
  position?: number;
  /** Optional last query (only stored if SHOWCASE_ANALYTICS_LOG_QUERIES=true on server) */
  queryContext?: string;
};

export async function POST(req: Request) {
  let body: ClickBody;
  try {
    body = (await req.json()) as ClickBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (sessionId.length < 4) {
    return NextResponse.json({ error: "session_required" }, { status: 400 });
  }

  const sku = typeof body.sku === "string" ? body.sku : "";
  const productId = typeof body.productId === "string" ? body.productId : "";
  if (!sku && !productId) {
    return NextResponse.json({ error: "sku_or_product" }, { status: 400 });
  }

  const allowQ = allowQueryTextInAnalytics();

  emitShowcaseAnalytics("product_click", {
    sessionId,
    tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
    sku: sku || undefined,
    productId: productId || undefined,
    position: typeof body.position === "number" ? body.position : undefined,
    ...(allowQ && typeof body.queryContext === "string" ? { queryContext: body.queryContext.slice(0, 480) } : {}),
  });

  return NextResponse.json({ ok: true });
}
