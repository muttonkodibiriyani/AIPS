import { NextResponse } from "next/server";

import { gatewayAdminHeaders, gatewayBase } from "@/lib/gateway-admin";

export const runtime = "nodejs";

type RouteCtx = { params: { jobId: string } };

/** Poll ingestion job lifecycle (PostgreSQL-backed in catalog-ingestion). */
export async function GET(_req: Request, ctx: RouteCtx) {
  const base = gatewayBase();
  if (!base) {
    return NextResponse.json(
      { error: "gateway_unconfigured", message: "Set COMMERCE_GATEWAY_URL." },
      { status: 503 },
    );
  }

  const jobId = String(ctx.params.jobId ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ error: "missing_job_id" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${base}/v1/admin/feeds/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: gatewayAdminHeaders({
        Accept: "application/json",
      }),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upstream_unreachable";
    return NextResponse.json({ error: "job_poll_failed", message: msg }, { status: 502 });
  }
}
