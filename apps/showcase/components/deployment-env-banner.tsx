"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";

type Health = {
  gatewayConfigured: boolean;
  demoSearchEnabled: boolean;
  liveSearchAvailable: boolean;
  csvCatalogRows?: number;
  csvCatalogTruncated?: boolean;
  csvCatalogRowCap?: number | null;
  offlineSearchAvailable?: boolean;
  gitCommit?: string | null;
};

function DeployRev({ sha }: { sha?: string | null }) {
  if (!sha || sha.length < 7) return null;
  const short = sha.slice(0, 7);
  return (
    <p className="mt-2 text-[10px] font-mono text-white/55">
      Deploy git SHA: {short} — compare with latest on{" "}
      <a
        href="https://github.com/muttonkodibiriyani/AIPS/commits/main"
        className="text-teal-300/95 underline-offset-2 hover:underline"
      >
        github.com/muttonkodibiriyani/AIPS
      </a>
    </p>
  );
}

/** Shown when Vercel env is missing or only demo mode — never exposes API keys. */
export function DeploymentEnvBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = (await r.json()) as Health;
        if (!cancelled) setHealth(j);
      } catch {
        if (!cancelled) setHealth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) return null;

  if (health.liveSearchAvailable) return null;

  if (health.offlineSearchAvailable && (health.csvCatalogRows ?? 0) > 0) {
    return (
      <div
        role="status"
        className="border-b border-sky-500/30 bg-sky-950/85 px-4 py-2.5 text-center text-[13px] text-sky-100/95"
      >
        <p className="inline-flex flex-wrap items-center justify-center gap-2">
          <Sparkles className="size-4 shrink-0 text-sky-300" aria-hidden />
          <span>
            <strong>CSV demo catalog</strong> — {health.csvCatalogRows?.toLocaleString()} products bundled at build (no
            production API key).
            {health.csvCatalogTruncated ? (
              <>
                {" "}
                Row cap <span className="font-mono text-[11px]">{health.csvCatalogRowCap?.toLocaleString() ?? "—"}</span>{" "}
                (large file). Use gateway + ingest for the full catalog.
              </>
            ) : null}{" "}
            Replace <span className="font-mono text-[11px]">apps/showcase/data/catalog.csv</span> with your file, push,
            redeploy.
          </span>
        </p>
        <DeployRev sha={health.gitCommit} />
      </div>
    );
  }

  if (health.demoSearchEnabled) {
    return (
      <div
        role="status"
        className="border-b border-teal-500/25 bg-teal-950/80 px-4 py-2.5 text-center text-[13px] text-teal-100/95"
      >
        <p className="inline-flex flex-wrap items-center justify-center gap-2">
          <Sparkles className="size-4 shrink-0 text-teal-300" aria-hidden />
          <span>
            <strong>Demo search</strong> — sample SKUs only. For live catalog search, add{" "}
            <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px]">COMMERCE_GATEWAY_URL</code> and{" "}
            <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px]">COMMERCE_API_KEY</code> in{" "}
            Vercel → Settings → Environment Variables, set{" "}
            <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px]">SHOWCASE_DEMO_SEARCH</code> to{" "}
            false, redeploy.
          </span>
        </p>
        <DeployRev sha={health.gitCommit} />
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="border-b border-amber-500/40 bg-amber-950/85 px-4 py-3 text-center text-[13px] leading-relaxed text-amber-50"
    >
      <p className="inline-flex flex-wrap items-center justify-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-300" aria-hidden />
        <span>
          <strong>Gateway not configured</strong> — add environment variables then{" "}
          <strong className="text-white">Redeploy</strong>. Production + Preview →{" "}
          <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px]">COMMERCE_GATEWAY_URL</code>{" "}
          (HTTPS Nest base URL),{" "}
          <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px]">COMMERCE_API_KEY</code>. Optional
          rehearsal:{" "}
          <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px]">SHOWCASE_DEMO_SEARCH=true</code>{" "}
          (omit gateway URL).
        </span>
      </p>
      <p className="mt-2 inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-amber-200/80">
        <Info className="size-3.5 shrink-0" aria-hidden />
        See repo <span className="font-mono">DEPLOYMENT_SHOWCASE.md</span> — environment variables, step 3 in section 2. Framework preset can stay Other —
        {" "}
        <span className="font-mono">vercel.json</span> selects Next.js.
      </p>
      <DeployRev sha={health.gitCommit} />
    </div>
  );
}
