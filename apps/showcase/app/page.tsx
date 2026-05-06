import Link from "next/link";
import {
  Globe2,
  Layers3,
  Search,
  Sparkles,
  Timer,
  Database,
  ShieldCheck,
} from "lucide-react";

import { CatalogUploadPanel } from "@/components/catalog-upload-panel";
import { Hero } from "@/components/hero";
import { NLSearchDemo } from "@/components/nl-search-demo";
import { FeatureCard } from "@/components/feature-card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Sparkles,
    title: "Natural‑language retrieval",
    body: "Customers describe intent in plain language; the engine merges lexical precision with semantic understanding and structured facets.",
  },
  {
    icon: Globe2,
    title: "Multilingual storefronts",
    body: "English & Arabic lexical analyzers plus shared embedding space roadmap — tuned for bilingual GCC retail catalogs.",
  },
  {
    icon: Layers3,
    title: "Hybrid BM25 + vector‑ready index",
    body: "OpenSearch‑backed: keyword strength for SKU/brand, scalable ANN hooks for conversational and vague queries.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant isolation",
    body: "Every document keyed by tenant; gateway auth, quotas, and future marketplace connectors share one secure control plane.",
  },
  {
    icon: Timer,
    title: "Path to sub‑second P95",
    body: "Precomputed searchable text, capped reranking windows, and Redis‑backed ingestion queues — benchmarks before public SLAs.",
  },
  {
    icon: Database,
    title: "Streaming CSV ingestion",
    body: "Gzip uploads to object storage → durable jobs → batched bulk index — designed for-million‑SKU scale without loading RAM.",
  },
];

export default function Page() {
  return (
    <div className="relative overflow-hidden">
      <Hero />

      {/* Trust ribbon */}
      <section className="border-y border-white/5 bg-black/25 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between">
          <p className="text-sm font-medium tracking-wide text-slate-400">Built for exec‑ready proofs</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">
            <span>Composable services</span>
            <span>•</span>
            <span>API‑first SDK</span>
            <span>•</span>
            <span>Self‑host or SaaS‑path</span>
          </div>
        </div>
      </section>

      {/* Demo banner */}
      <section id="experience" className="scroll-mt-28 py-24 sm:scroll-mt-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-14 text-center animate-fade-up">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300/95">
              <Search className="size-3.5" aria-hidden /> Live playground
            </span>
            <h2 className="font-display mt-4 text-3xl tracking-tight text-white sm:text-4xl lg:text-[2.65rem]">
              Natural‑language product search,&nbsp;
              <span className="text-gradient-warm">grounded</span>&nbsp;
              on your indexed catalog.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400">
              Paste a conversational query (“white stoneware vase under 200 AED for a gift”). Behind the gateway, parsers
              extract price and color cues, constrain OpenSearch facets, and return ranked SKU cards with explanations.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
              Wire <code className="rounded-md bg-white/10 px-1 py-0.5 text-teal-200/90">COMMERCE_GATEWAY_URL</code>{" "}
              in Vercel to your deployed Nest gateway (or expose a tunnel during the board demo).
            </p>
          </div>

          <NLSearchDemo />

          <div className="mt-14">
            <div className="mb-8 text-center">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Database className="size-3.5" aria-hidden /> Ingestion
              </span>
              <h3 className="font-display mt-4 text-2xl tracking-tight text-white sm:text-3xl">
                Upload full CSV — gzip in browser — background index
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
                Requires a running gateway + catalog-ingestion worker (Redis + Postgres + MinIO + OpenSearch). See{" "}
                <code className="text-slate-400">DEPLOYMENT_SHOWCASE.md</code> §5 and{" "}
                <code className="text-slate-400">scripts/catalog_upload_presigned.py</code> for CLI.
              </p>
            </div>
            <CatalogUploadPanel />
          </div>
        </div>
      </section>

      {/* Capability grid */}
      <section id="capabilities" className="border-t border-white/6 bg-black/35 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h3 className="font-display text-2xl tracking-tight text-white sm:text-3xl">
              Beyond “vector‑only toy search”
            </h3>
            <p className="mt-3 text-slate-400">
              Leadership asks for CTR, basket size, zero‑query recovery — commerce search needs lexical truth, facets,
              and operational hygiene.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={100 + i * 60} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="relative py-20">
        <div className="absolute inset-x-0 top-20 h-[320px] bg-gradient-to-r from-teal-500/14 via-transparent to-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div
            className={cn(
              "rounded-3xl border border-teal-500/25 bg-gradient-to-br from-slate-950/96 via-surface to-surface p-12 text-center shadow-glow lg:p-16",
              "glass-dark",
            )}
          >
            <h3 className="font-display text-2xl tracking-tight text-white sm:text-3xl lg:text-[2.2rem]">
              Ship the demo your board expects.
            </h3>
            <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400 lg:text-[15px]">
              Deploy the showcase UI to{" "}
              <span className="font-medium text-teal-200">Vercel</span>; run the ingestion + search APIs on Docker
              Compose, Railway, ECS, or on‑prem. Same OpenAPI contracts power mobile & web SDKs.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="https://vercel.com/new"
                prefetch={false}
                className="inline-flex rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 px-7 py-3.5 text-[15px] font-semibold text-slate-950 shadow-lg shadow-teal-500/35 transition hover:brightness-[1.05] active:scale-[0.99]"
              >
                Deploy on Vercel
              </Link>
              <Link
                href="#experience"
                className="rounded-xl border border-white/22 bg-transparent px-7 py-3.5 text-[15px] font-medium text-white transition hover:border-white/38 hover:bg-white/5 active:scale-[0.99]"
              >
                Show live NL search ↑
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
