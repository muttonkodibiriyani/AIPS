/**
 * Server-side analytics sink (stdout JSONL, optional webhook). No PII enrichment.
 */
type AnalyticsPayload = Record<string, unknown>;

export function emitShowcaseAnalytics(kind: string, payload: AnalyticsPayload): void {
  const sink = (process.env.SHOWCASE_ANALYTICS_SINK ?? "stdout").toLowerCase();
  if (sink === "none" || sink === "off") return;

  const envelope = {
    kind,
    ts: new Date().toISOString(),
    service: "commerce-ai-showcase",
    vercelEnv: process.env.VERCEL_ENV ?? null,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SHOWCASE_GIT_COMMIT ?? null,
    ...payload,
  };

  if (sink === "webhook") {
    const url = (process.env.SHOWCASE_ANALYTICS_WEBHOOK_URL ?? "").trim();
    if (!url) {
      console.warn("[showcase_analytics] webhook sink set but SHOWCASE_ANALYTICS_WEBHOOK_URL empty; falling back to stdout");
      console.log("[showcase_analytics]", JSON.stringify(envelope));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      keepalive: true,
    }).catch(() => {
      console.warn("[showcase_analytics] webhook delivery failed");
    });
    return;
  }

  console.log("[showcase_analytics]", JSON.stringify(envelope));
}

export function allowQueryTextInAnalytics(): boolean {
  return process.env.SHOWCASE_ANALYTICS_LOG_QUERIES === "true";
}
