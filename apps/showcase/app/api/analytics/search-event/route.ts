import { NextResponse } from "next/server";

import { allowQueryTextInAnalytics, emitShowcaseAnalytics } from "@/lib/analytics-sink";

type SearchEventBody = {
  sessionId?: string;
  tenantId?: string;
  queryLen?: number;
  queryText?: string;
  latencyMs?: number;
  totalHits?: number;
  sparseLlmHintCount?: number;
  topSkus?: unknown;
  fusion?: unknown;
  serverLatencyMs?: number | null;
  clientTs?: string;
};

export async function POST(req: Request) {
  let body: SearchEventBody;
  try {
    body = (await req.json()) as SearchEventBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (sessionId.length < 4) {
    return NextResponse.json({ error: "session_required" }, { status: 400 });
  }

  const topSkus = Array.isArray(body.topSkus) ? body.topSkus.filter((x): x is string => typeof x === "string").slice(0, 12) : [];

  emitShowcaseAnalytics("search_event", {
    sessionId,
    tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
    queryLen: typeof body.queryLen === "number" ? body.queryLen : undefined,
    ...(allowQueryTextInAnalytics() && typeof body.queryText === "string"
      ? { queryText: body.queryText.slice(0, 480) }
      : {}),
    latencyMs: typeof body.latencyMs === "number" ? body.latencyMs : undefined,
    totalHits: typeof body.totalHits === "number" ? body.totalHits : undefined,
    sparseLlmHintCount:
      typeof body.sparseLlmHintCount === "number" && body.sparseLlmHintCount >= 0
        ? Math.min(12, Math.floor(body.sparseLlmHintCount))
        : undefined,
    topSkus,
    fusion: body.fusion ?? undefined,
    serverLatencyMs:
      typeof body.serverLatencyMs === "number" || body.serverLatencyMs === null ? body.serverLatencyMs : undefined,
    clientTs: typeof body.clientTs === "string" ? body.clientTs : undefined,
  });

  return NextResponse.json({ ok: true });
}
