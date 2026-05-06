import { NextResponse } from "next/server";

import { gatewayAdminHeaders, gatewayBase } from "@/lib/gateway-admin";

export const runtime = "nodejs";

/**
 * Proxies gateway presign for .csv.gz upload (see contracts/openapi feedsPresign).
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
  let filename = typeof body.filename === "string" ? body.filename.trim() : "";

  if (!tenantId || !filename) {
    return NextResponse.json({ error: "missing_fields", message: "tenantId and filename required" }, { status: 400 });
  }

  if (!filename.toLowerCase().endsWith(".csv.gz")) {
    return NextResponse.json(
      { error: "invalid_filename", message: "Filename must end with .csv.gz (gzip CSV)." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${base}/v1/admin/feeds/presign`, {
      method: "POST",
      headers: gatewayAdminHeaders(),
      body: JSON.stringify({
        tenantId,
        filename,
      }),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upstream_unreachable";
    return NextResponse.json({ error: "presign_failed", message: msg }, { status: 502 });
  }
}
