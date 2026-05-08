import Link from "next/link";
import { BarChart3, Globe2, Layers3, Radar, Sparkles, Timer, Database, ShieldCheck } from "lucide-react";

import { CatalogPrepPanel } from "@/components/catalog-prep-panel";
import { Hero } from "@/components/hero";
import { NLSearchDemo } from "@/components/nl-search-demo";
import { FeatureCard } from "@/components/feature-card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Sparkles,
    title: "How customers discover products",
    body: "Shoppers type full sentences; deterministic parsers pull out price, colours, gender, and merch hints. Optional LLM JSON augments synonyms and category slugs, then results fuse with the raw lexical lane so SKUs stay discoverable even when wording is vague.",
  },
  {
    icon: Radar,
    title: "No dead ends on sparse runs",
    body: "When the catalog returns very few lexical hits, a second LLM pass proposes concrete follow‑up search phrases (clickable chips). Shoppers recover from “I want something sweet for guests” style wording without leaving search.",
  },
  {
    icon: Layers3,
    title: "Production path: OpenSearch gateway",
    body: "Wire COMMERCE_GATEWAY_URL to your deployed API: BM25‑strong matching for SKUs and titles, facet filters, and room to add dense vectors / KNN as you scale. The UI here mirrors the same POST /v1/search contract.",
  },
  {
    icon: BarChart3,
    title: "Search & click telemetry",
    body: "Server beacons record result counts, client and server latency, top SKUs shown, sparse‑hint exposure, and optional product clicks — stdout, webhook, or off — so you can track zero‑hit rate and engagement after deploy.",
  },
  {
    icon: Globe2,
    title: "Multilingual storefronts",
    body: "English and Arabic UX in the demo today; shared gateway analyzers and ingestion keep one pipeline for GCC‑style bilingual catalogs.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant isolation & ops",
    body: "Documents and API keys are tenant‑scoped at the gateway; pair the Vercel‑hosted showcase with Docker Compose or cloud workers for ingestion, queues, and indexing without forking contracts.",
  },
  {
    icon: Timer,
    title: "Measured performance",
    body: "Responses include server timing metadata; precomputed search_text, capped candidate windows, and async jobs keep retail‑scale latency predictable as you grow SKU count.",
  },
  {
    icon: Database,
    title: "Streaming CSV ingestion",
    body: "Gzip to object storage → durable jobs → bulk index updates — designed for multi‑million SKU feeds without holding the whole catalog in app RAM (use gateway mode when the static JSON bundle exceeds host limits).",
  },
];

export default function Page() {
  return (
    <div className="relative overflow-hidden">
      <Hero />

      {/* Trust ribbon */}
      <section className="border-y border-white/5 bg-black/25 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between">
          <p className="text-sm font-medium tracking-wide text-slate-400">Ship from GitHub · auto-build on Vercel</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">
            <span>CI eval suite</span>
            <span>•</span>
            <span>OpenSearch gateway</span>
            <span>•</span>
            <span>LLM‑assisted UX</span>
          </div>
        </div>
      </section>

      {/* Demo banner */}
      <section id="experience" className="scroll-mt-28 py-24 sm:scroll-mt-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-14 text-center animate-fade-up">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-violet-200/95">
              <Sparkles className="size-3.5" aria-hidden /> AI contextual search playground
            </span>
            <h2 className="font-display mt-4 text-3xl tracking-tight text-white sm:text-4xl lg:text-[2.65rem]">
              Contextual&nbsp;
              <span className="text-gradient-warm">AI search</span>&nbsp; first — then ranked products.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400">
              The default path interprets each message with an LLM augment (when keys are set), ranks the AI‑weighted lane
              ahead of raw keywords, and falls back to sparse “try this” suggestions if the catalog is quiet. Your shoppers
              stay in one search box from vague idea to SKU.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
              Deploy this app on Vercel from your repo, then set{" "}
              <code className="rounded-md bg-white/10 px-1 py-0.5 text-teal-200/90">COMMERCE_GATEWAY_URL</code> so the same UI
              queries your live OpenSearch corpus (keys stay in env — never in the browser).
            </p>
          </div>

          <NLSearchDemo />

          <div className="mt-16 space-y-6" id="catalog-prep">
            <div className="text-center">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-200/95">
                <Database className="size-3.5" aria-hidden /> Full catalogue on this site
              </span>
              <h3 className="font-display mt-3 text-2xl tracking-tight text-white sm:text-3xl">
                Gzip here → host URL → Vercel pulls every SKU into the demo
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
                The row cap in <code className="text-slate-400">apps/showcase/vercel.json</code> defaults to{" "}
                <code className="text-slate-400">200000</code>; set{" "}
                <code className="text-slate-400">SHOWCASE_DEMO_ROW_LIMIT=0</code> in Vercel (overrides build env) to include
                <em> all </em>parsed products. Very large builds need time and RAM — use the gateway path if the JSON bundle
                exceeds platform limits.
              </p>
            </div>
            <CatalogPrepPanel />
          </div>
        </div>
      </section>

      {/* Capability grid */}
      <section id="capabilities" className="border-t border-white/6 bg-black/35 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h3 className="font-display text-2xl tracking-tight text-white sm:text-3xl">
              Product discovery that leadership can measure
            </h3>
            <p className="mt-3 text-slate-400">
              Discovery is not only embeddings: lexical truth for SKUs, merchandising hints, recovery when queries are
              fuzzy, and telemetry to prove lift — this demo packages those behaviours for stakeholders.
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
              The storefront deploys from your Git repo to{" "}
              <span className="font-medium text-teal-200">Vercel</span>; connect it to ingestion and search APIs on Docker
              Compose, Railway, ECS, or on‑prem. Customers get conversational discovery, you get repeatable builds and JSON
              search contracts for web and mobile.
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
                Open AI search demo ↑
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
