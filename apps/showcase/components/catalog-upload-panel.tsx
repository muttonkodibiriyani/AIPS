"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CheckCircle2, Database, Loader2, UploadCloud, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type Health = { gatewayConfigured?: boolean; liveSearchAvailable?: boolean };

type PresignResponse = {
  uploadUrl?: string;
  objectKey?: string;
  error?: string;
  message?: string;
};

type ImportAccepted = {
  accepted?: boolean;
  jobId?: string;
  tenantId?: string;
  error?: string;
  message?: string;
};

type JobStatus = {
  jobId?: string;
  tenantId?: string;
  status?: string;
  objectKey?: string;
  rowsProcessed?: number;
  rowsIndexed?: number;
  errorMessage?: string | null;
};

async function gzipFile(file: File): Promise<Blob> {
  if (typeof CompressionStream === "undefined") {
    throw new Error(
      "This browser cannot gzip in-page (needs CompressionStream). Use Chrome / Edge / Safari 16.4+, or run scripts/catalog_upload_presigned.py.",
    );
  }
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

export function CatalogUploadPanel() {
  const [mounted, setMounted] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [tenantId, setTenantId] = useState("demo-sl");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = mounted && Boolean(health?.gatewayConfigured && health?.liveSearchAvailable);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json() as Promise<Health>)
      .then((j) => {
        if (!cancelled) setHealth(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!jobId || !ready) return;
    let cancelled = false;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      try {
        const r = await fetch(`/api/catalog-upload/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const j = (await r.json()) as JobStatus;
        if (cancelled) return;
        setJob(j);
        if (j.status === "completed" || j.status === "failed" || n > 720) {
          clearInterval(t);
          setBusy(false);
          setStep(null);
          if (j.status === "failed") setError(j.errorMessage ?? j.status ?? "Job failed");
        }
      } catch {
        clearInterval(t);
        if (!cancelled) setBusy(false);
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [jobId, ready]);

  const gzName = useMemo(() => {
    if (!file) return "";
    const raw = file.name.replace(/\\/g, "/").split("/").pop() ?? "catalog.csv";
    const dot = raw.lastIndexOf(".");
    const base = dot > 0 ? raw.slice(0, dot) : raw;
    return `${base.replace(/[^a-zA-Z0-9._-]+/g, "_")}_${Date.now()}.csv.gz`;
  }, [file]);

  const run = useCallback(async () => {
    setError(null);
    setJob(null);
    setJobId(null);
    setLog("");
    setStep(null);
    if (!file || !tenantId.trim()) {
      setError("Choose a UTF-8 .csv export and tenant id.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Select a UTF-8 .csv file — it will be gzip-compressed automatically.");
      return;
    }
    setBusy(true);
    try {
      setStep("Gzip CSV in-browser…");
      const gzBlob = await gzipFile(file);

      setStep("Reserve MinIO PUT URL via gateway…");
      const ps = await fetch("/api/catalog-upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenantId.trim(), filename: gzName }),
      });
      const pr = (await ps.json()) as PresignResponse;
      if (!ps.ok || !pr.uploadUrl || !pr.objectKey) {
        throw new Error(`${pr.message ?? pr.error ?? "presign_denied"} (HTTP ${ps.status})`);
      }
      setLog((l) => l + `\n✓ uploadUrl (${pr.objectKey})`);

      setStep(`Upload gzipped CSV (~${Math.max(1, Math.round(gzBlob.size / 1024))} KiB PUT) → object storage`);
      const put = await fetch(pr.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/gzip",
        },
        body: gzBlob,
      });
      if (!put.ok) {
        throw new Error(
          `Upload failed HTTP ${put.status}. If blocked by browser CORS, allow your site origin on MinIO CORS rules, or curl PUT to uploadUrl.`,
        );
      }

      setStep("Enqueue Python ingestion worker (OpenSearch bulk upsert)");
      const im = await fetch("/api/catalog-upload/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          objectKey: pr.objectKey,
          originalFilename: file.name,
          defaultMarket: "AE",
        }),
      });
      const ir = (await im.json()) as ImportAccepted;
      if (!im.ok || !ir.jobId || !ir.accepted) {
        throw new Error(`${ir.message ?? ir.error ?? "import_denied"} (HTTP ${im.status})`);
      }
      setJobId(ir.jobId);
      setStep("Indexing in background…");
      setLog((l) => l + `\n✓ Job ${ir.jobId} queued`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "upload_pipeline_failed";
      setError(msg);
      setBusy(false);
      setStep(null);
    }
  }, [file, tenantId, gzName]);

  return (
    <section
      className={cn(
        "rounded-3xl border border-white/10 bg-black/35 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur",
        "-mt-2",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border border-teal-500/25 bg-teal-500/10">
            <UploadCloud className="size-5 text-teal-200/95" aria-hidden />
          </div>
          <div>
            <h3 className="font-display text-lg tracking-tight text-white">CSV → gzip catalogue upload</h3>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Gzip locally, stream to bucket with a presigned <code className="text-teal-200/90">PUT</code>, then the
              existing <strong className="text-slate-200">Python ingestion job</strong> streams rows and bulk-upserts{" "}
              <strong>OpenSearch</strong>.
            </p>
          </div>
        </div>
        {!ready && mounted && (
          <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-200/90">
            Gateway disconnected
          </span>
        )}
      </div>

      {!ready ? (
        <p className="mt-6 text-sm text-slate-500">
          Set{" "}
          <code className="rounded-md bg-white/10 px-1 text-slate-200">COMMERCE_GATEWAY_URL</code> (+ API key server-side)
          to enable uploads. Offline CSV demo search ignores this pipe.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tenant</span>
            <input
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/50"
              value={tenantId}
              disabled={busy}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">UTF-8 catalogue CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-500/90 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-teal-950"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && gzName && (
            <p className="text-xs text-slate-500 sm:col-span-2">
              Presigned object name:{" "}
              <code className="rounded-md bg-white/10 px-1 text-slate-300">{gzName}</code>
            </p>
          )}
        </div>
      )}

      {ready && (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !file}
              onClick={run}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition",
                busy || !file
                  ? "cursor-not-allowed bg-white/5 text-slate-500"
                  : "bg-teal-500 text-teal-950 hover:bg-teal-400 shadow-lg shadow-teal-500/20",
              )}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" aria-hidden />}
              {busy ? step ?? "Working…" : "Gzip · upload · index"}
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {job?.status === "completed" && !error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
              <div>
                <p className="font-medium">Ingest finished</p>
                <p className="mt-1 text-emerald-200/85">
                  Processed {(job.rowsProcessed ?? 0).toLocaleString()} · indexed {(job.rowsIndexed ?? 0).toLocaleString()}{" "}
                  docs.
                </p>
              </div>
            </div>
          )}

          {job?.status &&
            job.status !== "completed" &&
            job.status !== "failed" &&
            jobId &&
            !error && (
              <p className="mt-4 text-xs text-slate-500">
                Job <code className="text-slate-400">{jobId}</code> status:{" "}
                <span className="text-slate-300">{job.status}</span>
                {(job.rowsProcessed ?? 0) > 0 && (
                  <span className="ml-2">
                    {(job.rowsProcessed ?? 0).toLocaleString()} rows streamed…
                  </span>
                )}
              </p>
            )}

          {log && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-white/8 bg-black/40 p-4 text-[11px] leading-relaxed text-slate-500">
              {log.trim()}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
