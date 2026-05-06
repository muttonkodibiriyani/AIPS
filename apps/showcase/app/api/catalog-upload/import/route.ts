import { NextResponse } from "next/server";

import { gatewayAdminHeaders, gatewayBase } from "@/lib/gateway-admin";

export const runtime = "nodejs";

/**
 * Proxies ingest enqueue after object is PUT to uploadUrl from presign response.
 */
export async function POST(req: Request) {
  const base = gatewayBase();
  if (!base) {
    return NextResponse.json(
      { error: "gateway_unconfigured", message: "Set COMMERCE_GATEWAY_URL for catalog upload." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
  const objectKey = typeof body.objectKey === "string" ? body.objectKey.trim() : "";
  const originalFilename =
    typeof body.originalFilename === "string" ? body.originalFilename.trim() : undefined;

  const defaultMarket = typeof body.defaultMarket === "string" ? body.defaultMarket.trim() : undefined;

  if (!tenantId || !objectKey) {
    return NextResponse.json(
      { error: "missing_fields", message: "tenantId and objectKey required" },
      { status: 400 },
    );
  }

  const reqBody: Record<string, unknown> = {
    tenantId,
    objectKey,
    originalFilename: originalFilename ?? null,
  };
  if (defaultMarket) reqBody.defaultMarket = defaultMarket;

  try {
    const upstream = await fetch(`${base}/v1/admin/feeds/import`, {
      method: "POST",
      headers: gatewayAdminHeaders(),
      body: JSON.stringify(reqBody),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upstream_unreachable";
    return NextResponse.json({ error: "import_failed", message: msg }, { status: 502 });
  }
}