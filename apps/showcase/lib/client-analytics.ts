/**
 * Browser beacons (same-origin). Fire-and-forget; never blocks navigation.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const k = "commerce-ai-showcase-sid";
    let s = window.sessionStorage.getItem(k);
    if (!s || s.length < 8) {
      s = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      window.sessionStorage.setItem(k, s);
    }
    return s;
  } catch {
    return "";
  }
}

export async function beaconSearchEvent(payload: {
  sessionId: string;
  tenantId: string;
  queryLen: number;
  queryText?: string;
  latencyMs: number;
  totalHits: number;
  /** Count of LLM-generated alternative queries shown (sparse-result recovery). */
  sparseLlmHintCount?: number;
  topSkus: string[];
  fusion?: Record<string, unknown> | null;
  serverLatencyMs?: number | null;
  clientTs?: string;
}): Promise<void> {
  try {
    const body = JSON.stringify(payload);
    await fetch("/api/analytics/search-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* offline / adblock */
  }
}

export async function beaconProductClick(payload: {
  sessionId: string;
  tenantId: string;
  queryContext?: string;
  sku: string;
  productId: string;
  position: number;
}): Promise<void> {
  try {
    await fetch("/api/analytics/product-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
