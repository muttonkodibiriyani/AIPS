"use client";

import { useCallback, useState } from "react";

import { Download, Loader2, Package } from "lucide-react";

import { cn } from "@/lib/utils";

function gzipWithProgress(file: File, onPct: (p: number) => void): Promise<Blob> {
  const total = Math.max(file.size, 1);
  let passed = 0;
  const counted = file.stream().pipeThrough(
    new TransformStream({
      transform(chunk: Uint8Array, ctrl) {
        passed += chunk.byteLength;
        onPct(Math.min(55, Math.round((passed / total) * 55)));
        ctrl.enqueue(chunk);
      },
    }),
  );
  const gzStream = counted.pipeThrough(new CompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  const reader = gzStream.getReader();
  let gzAcc = 0;
  return (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          gzAcc += value.byteLength;
          const approx = Math.min(98, 55 + Math.round((gzAcc / (total * 0.35 + 1)) * 42));
          onPct(approx);
        }
      }
    } finally {
      reader.releaseLock();
    }
    return new Blob(chunks, { type: "application/gzip" });
  })();
}

async function shortFingerprint(label: string, size: number): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${label}:${size}`));
  return [...new Uint8Array(buf)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Browser-only CSV → downloadable .csv.gz with progress. Use with Vercel `SHOWCASE_CATALOG_URL` +
 * `SHOWCASE_DEMO_ROW_LIMIT=0` so the prebuild embeds the full catalog for offline NL + LLM search.
 */
export function CatalogPrepPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("Idle");
  const [pct, setPct] = useState(0);
  const [gzLabel, setGzLabel] = useState("—");
  const [readerLabel, setReaderLabel] = useState("—");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCompress =
    typeof window !== "undefined" && typeof CompressionStream !== "undefined";

  const run = useCallback(async () => {
    setError(null);
    setMessage(null);
    const f = file;
    if (!f) return;
    if (!canCompress) {
      setError(
        "This browser cannot gzip in-page. Use Chrome / Edge / Safari 16.4+, or tools/catalog-gzip-prep/index.html.",
      );
      return;
    }
    setBusy(true);
    setStage("Gzip…");
    setPct(0);
    setReaderLabel(`${(f.size / 1048576).toFixed(2)} MiB`);
    try {
      const rawName = (f.name.split(/[/\\]/).pop() ?? "catalog.csv").trim();
      const stem = rawName.toLowerCase().endsWith(".csv") ? rawName.slice(0, -4) : rawName;
      const id = `${Date.now().toString(36)}_${(await shortFingerprint(f.name, f.size)).slice(0, 8)}`;
      const outName = `${stem.replace(/[^a-zA-Z0-9._-]/g, "_")}_${id}.csv.gz`;

      const blob = await gzipWithProgress(f, setPct);
      setGzLabel(blob.size >= 1048576 ? `${(blob.size / 1048576).toFixed(1)} MiB gz` : `${Math.ceil(blob.size / 1024)} KiB gz`);
      setPct(99);
      setStage("Download…");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = outName;
      a.rel = "noopener";
      a.click();
      URL.revokeObjectURL(a.href);
      setPct(100);
      setStage("Done");
      setMessage(
        `Saved ${outName}. Host it at HTTPS, set SHOWCASE_CATALOG_URL to that URL, set SHOWCASE_DEMO_ROW_LIMIT=0 (Vercel env), redeploy — every product row is compiled into demo-catalog.json and NL + LLM search uses that bundle.`,
      );
    } catch (e: unknown) {
      setStage("Error");
      setError(e instanceof Error ? e.message : "gzip_failed");
      setPct(0);
    } finally {
      setBusy(false);
    }
  }, [file, canCompress]);

  return (
    <div
      className={cn(
        "rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/85 to-black/65 p-6 sm:p-8",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/35 bg-amber-500/10">
          <Package className="size-6 text-amber-200/95" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl tracking-tight text-white sm:text-2xl">
            Include every product · gzip upload prep + Vercel build
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Pick your catalogue <code className="text-slate-300">.csv</code> below — gzip runs entirely in your browser and
            downloads <code className="text-slate-300">*.csv.gz</code>. Publish that file to HTTPS, point{" "}
            <code className="text-slate-300">SHOWCASE_CATALOG_URL</code> at it, set{" "}
            <code className="text-slate-300">SHOWCASE_DEMO_ROW_LIMIT=0</code> so{" "}
            <code className="text-slate-300">prebuild</code> keeps <strong className="text-slate-200">all rows</strong> in{" "}
            <code className="text-slate-300">demo-catalog.json</code>. Add Gemini/OpenRouter keys — LLM enhances each search
            over that bundle (no offline “training” step).
          </p>
        </div>
      </div>

      {!canCompress && (
        <p className="mt-4 text-sm text-amber-300/90">
          CompressionStream gzip is unavailable. Use Chrome / Edge / Safari 16.4+, or{" "}
          <code className="text-teal-200/90">tools/catalog-gzip-prep/index.html</code>.
        </p>
      )}

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">UTF-8 catalogue CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-500/95 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-teal-950"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !file || !canCompress}
            onClick={run}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition",
              busy || !file || !canCompress
                ? "cursor-not-allowed bg-white/5 text-slate-500"
                : "bg-gradient-to-r from-teal-400 to-emerald-500 text-teal-950 shadow-lg shadow-teal-500/15 hover:from-teal-300 hover:to-emerald-400",
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" aria-hidden />}
            {busy ? "Working…" : "Convert to .csv.gz & download"}
          </button>
          <span className="text-xs text-slate-500">
            {stage} · source <span className="text-slate-400">{readerLabel}</span> · gzip{" "}
            <span className="text-slate-400">{gzLabel}</span>
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>

        {message && <p className="text-sm text-emerald-200/90">{message}</p>}
        {error && <p className="text-sm text-red-300/95">{error}</p>}

        <ol className="list-decimal space-y-2 pl-5 text-xs text-slate-500">
          <li>
            Upload the downloaded gzip to permanent HTTPS (GitHub Release, R2, Blob, CDN).
          </li>
          <li>
            Vercel · Project · Env: <code className="text-slate-400">SHOWCASE_CATALOG_URL</code> = file URL ·{" "}
            <code className="text-slate-400">SHOWCASE_DEMO_ROW_LIMIT=0</code> · optionally{" "}
            <code className="text-slate-400">SHOWCASE_DEMO_STRATIFY=false</code> · keep{" "}
            <code className="text-slate-400">NODE_OPTIONS</code> heap high (already in{" "}
            <code className="text-slate-400">vercel.json</code>).
          </li>
          <li>
            Add <code className="text-slate-400">GEMINI_API_KEY</code> / <code className="text-slate-400">OPENROUTER_API_KEY</code>{" "}
            for parallel LLM intent on CSV search — see <code className="text-slate-400">DEPLOYMENT_SHOWCASE.md</code>.
          </li>
          <li>
            Redeploy. Product discovery NL queries hit <code className="text-slate-400">/api/search</code> over the full bundled
            catalog.
          </li>
        </ol>
      </div>
    </div>
  );
}
