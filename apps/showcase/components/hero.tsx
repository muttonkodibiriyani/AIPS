import Link from "next/link";
import { ArrowDownRight, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="relative">
      <div className="absolute inset-0 bg-hero-radial pointer-events-none" aria-hidden />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-28 pt-[5.75rem] sm:grid-cols-[1.06fr,.94fr] sm:items-start sm:pt-24 lg:gap-24">
        <div className="animate-fade-up">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
            GitHub → Vercel · Gateway‑ready APIs
          </p>
          <h1 className="font-display text-[2.65rem] font-medium leading-[1.08] tracking-tight text-white sm:text-[3.05rem] lg:text-[3.45rem]">
            <span className="text-gradient-warm">AI contextual search</span>
            <br />
            leads product discovery — integrated in days, not quarters.
          </h1>

          <p className="mt-7 max-w-xl text-[1.065rem] leading-relaxed text-slate-400">
            Shoppers describe what they want in everyday language — the showcase blends fast lexical retrieval with optional
            LLM‑guided cues (gender, merch buckets, synonyms). When matches are thin, the UI surfaces refined search phrases
            so customers still discover products. Plug in your Nest gateway + OpenSearch for full‑catalog BM25 production
            traffic.
          </p>

          <div className="mt-11 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href="#experience"
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 px-[1.5rem] py-4 text-[0.935rem] font-semibold tracking-tight text-slate-950 shadow-lg shadow-teal-500/[0.42] ring-1 ring-white/10 transition hover:brightness-[1.06] active:translate-y-[0.5px]"
            >
              <Sparkles className="size-[1.125rem]" strokeWidth={2} aria-hidden />
              Try AI contextual search
            </Link>
            <Link
              href="#capabilities"
              className="group inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
            >
              Architecture walkthrough
              <ArrowDownRight className="size-4 transition group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
            </Link>
          </div>

          <dl className="mt-16 grid max-w-lg grid-cols-3 gap-6 border-t border-white/[0.07] pt-10 text-left sm:max-w-none">
            {[
              { k: "Hybrid core", v: "BM25 + ANN bridge" },
              { k: "Regions", v: "EN / AR ready" },
              { k: "Ops model", v: "Self‑host + cloud" },
            ].map((row) => (
              <div key={row.k}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{row.k}</dt>
                <dd className="mt-1.5 text-sm font-medium text-slate-200">{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mt-2 sm:mt-6">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-teal-500/25 via-blue-500/10 to-amber-500/16 blur-2xl" />
          <div className="relative overflow-hidden rounded-[1.35rem] border border-white/12 bg-slate-950/70 p-6 shadow-[0_25px_80px_-40px_rgba(0,0,0,.75)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono">Query · interpretation</span>
              <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300/90">
                Live stack
              </span>
            </div>
            <pre className="overflow-x-auto rounded-xl border border-white/[0.06] bg-black/55 p-4 font-mono text-[11.5px] leading-relaxed text-teal-100/90">
              {`POST /v1/search
{
  "query": "blue cotton shirt under 150 SAR",
  "tenantId": "your-tenant",
  "locale": "en-SA",
  "context": { "market": "SA" }
}`}
            </pre>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              On the gateway, parsers apply price ranges, facets, and BM25‑style relevance. This Next.js showcase adds an
              optional LLM lane to expand intent and merges ranked lists; sparse runs can show alternate queries — all
              instrumented for latency and engagement signals.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
