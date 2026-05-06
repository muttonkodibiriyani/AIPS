"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ChevronDown, Cpu, Filter, Loader2, Search, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";

type ProductHit = Record<string, unknown> & {
  title?: Record<string, string>;
  sku?: string;
  product_id?: string;
  images?: string[];
  market?: string;
  pricing?: Record<string, number>;
  availability?: boolean;
  attrs?: Record<string, string>;
  _score?: number;
};

const NL_EXAMPLES: { short: string; full: string }[] = [
  { short: "White vase < 200 AED", full: "White stoneware vase under 200 AED for a minimalist living room" },
  { short: "Blue jacket · SAR", full: "Blue denim jacket size M under 450 SAR gifts for men" },
  { short: "Ivory duvet", full: "Organic cotton duvet cover ivory queen bed under 350 AED" },
  { short: "Black leather bag", full: "Black leather crossbody compact travel under 500 SAR" },
];

function imgUrl(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function pickTitle(p: ProductHit): string {
  const t = p.title;
  if (t && typeof t === "object") {
    const pick = t.en || t.ar;
    if (pick) return pick;
  }
  return typeof p.sku === "string" ? p.sku : "Product";
}

/** Corridor-aligned shelf price from demo catalog `pricing` map (never relevance `_score`). */
function formatProductPrice(p: ProductHit, market: string): string | null {
  const pr = p.pricing;
  if (!pr || typeof pr !== "object") return null;
  const aed = typeof pr.aed === "number" && Number.isFinite(pr.aed) ? pr.aed : null;
  const sar = typeof pr.sar === "number" && Number.isFinite(pr.sar) ? pr.sar : null;
  if (market === "SA") {
    if (sar != null) return `${sar.toFixed(2)} SAR`;
    if (aed != null) return `${aed.toFixed(2)} AED`;
  } else {
    if (aed != null) return `${aed.toFixed(2)} AED`;
    if (sar != null) return `${sar.toFixed(2)} SAR`;
  }
  return null;
}

export function NLSearchDemo() {
  const [query, setQuery] = useState(NL_EXAMPLES[0].full);
  const [tenant, setTenant] = useState("demo-sl");
  const [market, setMarket] = useState("AE");
  const [locale, setLocale] = useState("en-AE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    products?: ProductHit[];
    facets?: Record<string, { key?: string; count?: number }[]>;
    total?: number;
    appliedFilters?: Record<string, unknown>;
    error?: string;
    message?: string;
  } | null>(null);

  const search = useCallback(
    async (queryOverride?: string) => {
      const qText = (queryOverride ?? query).trim();
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: tenant,
            locale,
            query: qText,
            context: { market, lexicalWeight: 0.45, semanticWeight: 0.55 },
            pagination: { from: 0, size: 12 },
          }),
        });
        const json = (await res.json()) as {
          products?: ProductHit[];
          facets?: Record<string, { key?: string; count?: number }[]>;
          total?: number;
          appliedFilters?: Record<string, unknown>;
          error?: string;
          message?: string;
        };
        setData(json);
        if (!res.ok) setError(json.message || json.error || `Search failed (${res.status})`);
      } catch {
        setError("Network error — is the gateway reachable?");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [tenant, locale, query, market],
  );

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")?.trim();
    if (!q) return;
    setQuery(q);
    void search(q);
    // Bootstrap only — header search drives follow-up queries via showcase-run-search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onRun(e: Event) {
      const detail = (e as CustomEvent<{ query?: string }>).detail?.query?.trim();
      if (!detail) return;
      setQuery(detail);
      void search(detail);
    }
    window.addEventListener("showcase-run-search", onRun);
    return () => window.removeEventListener("showcase-run-search", onRun);
  }, [search]);

  const products = data?.products ?? [];
  const facets = data?.facets ?? {};
  const applied = data?.appliedFilters ?? {};

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr,minmax(200px,.34fr)]">
      <div className="rounded-[1.25rem] border border-white/10 bg-black/55 p-px shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-2xl [&>div]:rounded-[calc(1.25rem-1px)] [&>div]:bg-surface/93 [&>div]:p-8">
        <div>
          <label className="sr-only">Natural-language query</label>
          <div className="relative">
            <Wand2
              aria-hidden
              className="pointer-events-none absolute left-4 top-[1.1rem] size-5 text-teal-300/85"
              strokeWidth={1.85}
            />
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe what shoppers are hunting for..."
              rows={3}
              className="block w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 py-4 pl-[3.15rem] pr-4 font-[inherit] text-[1.035rem] text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-teal-500/45 focus:bg-slate-950/90"
              dir={locale.startsWith("ar") ? "rtl" : "ltr"}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {NL_EXAMPLES.map((ex) => (
              <button
                key={ex.full}
                type="button"
                title={ex.full}
                onClick={() => setQuery(ex.full)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-left text-[11px] font-medium leading-snug transition",
                  query === ex.full
                    ? "border-teal-500/42 bg-teal-500/12 text-teal-50"
                    : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-teal-500/28 hover:bg-white/[0.07] hover:text-slate-200",
                )}
              >
                {ex.short}
              </button>
            ))}
          </div>

          <div className="mt-7 grid gap-4 border-t border-white/10 pt-7 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="tenant" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Tenant
              </label>
              <input
                id="tenant"
                type="text"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                className="block w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-teal-500/55 focus-visible:ring-2"
              />
            </div>
            <div className="relative space-y-1.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Market</span>
              <div className="relative">
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="block w-full cursor-pointer appearance-none rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 pr-10 text-sm outline-none ring-teal-500/55 focus-visible:ring-2"
                >
                  <option value="AE">AE · UAE corridor</option>
                  <option value="SA">SA · KSA corridor</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              </div>
            </div>
            <div className="relative space-y-1.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Locale</span>
              <div className="relative">
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="block w-full cursor-pointer appearance-none rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 pr-10 text-sm outline-none ring-teal-500/55 focus-visible:ring-2"
                >
                  <option value="en-AE">English · AE</option>
                  <option value="ar-AE">العربية · AE</option>
                  <option value="en-SA">English · SA</option>
                  <option value="ar-SA">العربية · SA</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => search()}
            disabled={loading}
            className="mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-4 text-[0.935rem] font-semibold tracking-tight text-slate-950 shadow-lg shadow-teal-500/35 disabled:opacity-55 sm:w-auto sm:min-w-[11.5rem] sm:px-14"
          >
            {loading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-[1.1rem]" strokeWidth={2.4} />}
            Run search
          </button>

          {error ? (
            <div className="mt-6 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
              <p>{error}</p>
              {(data?.error === "gateway_unconfigured" ||
                data?.error === "demo_unconfigured" ||
                /gateway/i.test(String(error))) && (
                <p className="mt-3 font-mono text-[11px] text-amber-200/85">
                  Vercel → Env: COMMERCE_GATEWAY_URL + COMMERCE_API_KEY · or SHOWCASE_DEMO_SEARCH=true (sample SKUs) · redeploy
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-xl border border-white/10 bg-slate-950/75 p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Filter className="size-4" /> Interpreted constraint stack
          </div>
          {Object.keys(applied).length === 0 ? (
            <p className="text-sm text-slate-500">
              After each query, parsers echo structured hints (price cap, palette, corridor).
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(applied).map(([k, v]) => (
                <li
                  key={k}
                  className="rounded-md border border-white/15 bg-teal-500/10 px-2.5 py-1 font-mono text-[11px] text-teal-50"
                >
                  {k}: {JSON.stringify(v)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/75 p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Cpu className="size-4" /> Facets snapshot
          </div>
          {!facets.colors?.length && !facets.markets?.length && !facets.categories?.length ? (
            <p className="mb-5 text-sm text-slate-500">
              Populate OpenSearch facets — colours + corridor aggregates render here instantly.
            </p>
          ) : null}
          {facets.colors?.length ? <FacetGroup label="Colours" buckets={facets.colors} /> : null}
          {facets.markets?.length ? <FacetGroup label="Corridors" buckets={facets.markets} /> : null}
          {facets.categories?.length ? <FacetGroup label="Merch buckets" buckets={facets.categories} /> : null}
        </div>
      </aside>

      <div className="lg:col-span-2 rounded-[1.1rem] border border-white/10 bg-slate-950/70 px-6 py-7 sm:px-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-display text-lg text-white lg:text-xl">Results runway</h4>
          {typeof data?.total === "number" ? (
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-100">
              Total matches · {data.total.toLocaleString()}
            </span>
          ) : null}
        </div>

        {!loading && products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/35 py-16 text-center">
            <p className="text-sm font-medium text-slate-300">Indexing path clear — hydrate this tenant&apos;s SKU base.</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-slate-500">
              When ingestion completes, titles, corridor codes, imagery, availability, and score trails populate this grid.
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-white/[0.05]" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p, idx) => {
              const imgs = Array.isArray(p.images) ? (p.images as string[]) : [];
              const raw = imgs[0];
              const src = raw ? imgUrl(raw) : null;
              const pid = String(p.product_id ?? p.sku ?? idx);
              const href = `/product/${encodeURIComponent(pid)}`;
              const priceLabel = formatProductPrice(p, market);
              const sizeLabel =
                p.attrs && typeof p.attrs.size === "string" && p.attrs.size.trim()
                  ? p.attrs.size.trim()
                  : null;
              return (
                <li key={`${pid}-${idx}`} className="list-none">
                  <Link
                    href={href}
                    className="group flex overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 transition hover:border-teal-500/40 hover:bg-slate-900/95"
                  >
                  <div className="relative h-[132px] w-[126px] shrink-0 overflow-hidden border-r border-white/10 bg-black/55">
                    {src ? (
                      <Image
                        src={src}
                        alt=""
                        fill
                        className="object-cover transition duration-500 group-hover:scale-[1.04]"
                        sizes="126px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-slate-600">
                        Image URL optional
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3">
                    <div>
                      <p className="line-clamp-2 text-[0.9275rem] font-medium leading-snug text-slate-100">{pickTitle(p)}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        SKU {String(p.sku ?? p.product_id ?? "—")} · {String(p.market ?? "—")}
                        {sizeLabel ? <span className="text-slate-600"> · Size {sizeLabel}</span> : null}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span className={p.availability !== false ? "text-emerald-300" : "text-rose-400"}>
                        {p.availability !== false ? "Stock · available" : "Stock · guarded"}
                      </span>
                      {priceLabel ? (
                        <span className="font-mono text-[11.5px] text-teal-100/90">{priceLabel}</span>
                      ) : (
                        <span className="font-mono text-[10px] opacity-50">—</span>
                      )}
                    </div>
                  </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FacetGroup({
  label,
  buckets,
}: {
  label: string;
  buckets: { key?: string; count?: number }[];
}) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {buckets.slice(0, 14).map((b) => (
          <li key={String(b.key)} className="rounded-md bg-white/[0.05] px-2 py-[0.275rem] text-[11px] text-slate-300">
            {String(b.key)} ({b.count?.toLocaleString() ?? "0"})
          </li>
        ))}
      </ul>
    </div>
  );
}
