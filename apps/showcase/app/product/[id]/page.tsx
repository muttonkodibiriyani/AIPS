import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import demoCatalog from "@/lib/demo-catalog.json";
import { buildPdpNlSearchQuery, type DemoCatalogFile, type ProductRecord } from "@/lib/csv-demo-search";

function imgUrl(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function findProduct(idParam: string): ProductRecord | undefined {
  const cat = demoCatalog as DemoCatalogFile;
  const decoded = decodeURIComponent(idParam);
  return cat.products.find((p) => String(p.product_id) === decoded || String(p.sku) === decoded);
}

function seedTokensFromProduct(p: ProductRecord): string[] {
  const hay = `${p.title?.en ?? ""} ${p.search_text ?? ""}`.toLowerCase();
  const raw = hay.match(/\p{L}[\p{L}\p{N}]{3,}/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
      if (out.length >= 28) break;
    }
  }
  return out;
}

function relatedDemoProducts(cur: ProductRecord, catalog: DemoCatalogFile, limit: number): ProductRecord[] {
  const poolAll = catalog.products.filter((x) => x.product_id !== cur.product_id);
  const slug = cur.attrs?.retrieval_category?.trim();
  const narrowed = slug ? poolAll.filter((x) => (x.attrs?.retrieval_category ?? "") === slug) : poolAll;
  const candidates = narrowed.length >= Math.min(limit + 2, 8) ? narrowed : poolAll;
  const seeds = seedTokensFromProduct(cur);
  const cgCur = (cur.attrs?.customer_group ?? "").toLowerCase();
  const colorCur = cur.attrs?.color?.trim().toLowerCase();

  const scored = candidates.map((p) => {
    const blob = `${p.title?.en ?? ""} ${p.search_text ?? ""}`.toLowerCase();
    let score = 0;
    for (const w of seeds) {
      if (blob.includes(w)) score += 1;
    }
    if (colorCur && p.attrs?.color?.trim().toLowerCase() === colorCur) score += 4;
    const pg = (p.attrs?.customer_group ?? "").toLowerCase();
    if (cgCur.includes("woman") && pg.includes("woman")) score += 2;
    if (cgCur.includes("man") && !cgCur.includes("woman") && pg.includes("man") && !pg.includes("woman")) score += 2;

    const cap = Number(p.pricing?.aed ?? p.pricing?.sar ?? NaN);
    if (!Number.isNaN(cap)) {
      const ref = Number(cur.pricing?.aed ?? cur.pricing?.sar ?? cap);
      if (!Number.isNaN(ref)) {
        const hi = Math.max(cap, ref);
        const lo = Math.min(cap, ref);
        if (lo > 0 && hi / lo <= 1.85) score += 1;
      }
    }
    return { p, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.p.sku).localeCompare(String(b.p.sku));
  });

  const picked = scored.filter((x) => x.score > 0).slice(0, limit).map((x) => x.p);
  return picked.length > 0 ? picked : scored.slice(0, limit).map((x) => x.p);
}

export const dynamic = "force-dynamic";

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const p = findProduct(params.id);
  if (!p) notFound();

  const cat = demoCatalog as DemoCatalogFile;
  const related = relatedDemoProducts(p, cat, 8);
  const canonicalSearchQ = buildPdpNlSearchQuery(p, cat);

  const title = p.title?.en || p.title?.ar || p.sku;
  const images = Array.isArray(p.images) ? p.images.map(imgUrl).filter(Boolean) : [];

  const priceBits: string[] = [];
  if (p.pricing?.aed != null) priceBits.push(`${p.pricing.aed} AED`);
  if (p.pricing?.sar != null) priceBits.push(`${p.pricing.sar} SAR`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <Link
        href="/?#experience"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-teal-300/95 transition hover:text-teal-200"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to search
      </Link>

      <div className="overflow-hidden rounded-[1.35rem] border border-white/12 bg-slate-950/85 shadow-[0_25px_80px_-40px_rgba(0,0,0,.75)]">
        <div className="grid gap-0 sm:grid-cols-[minmax(280px,1fr),1.2fr]">
          <div className="relative aspect-square border-b border-white/10 bg-black/55 sm:border-b-0 sm:border-r sm:border-white/10">
            {images[0] ? (
              <Image
                src={images[0]}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width:640px)100vw,420px"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">No image</div>
            )}
          </div>

          <div className="flex flex-col gap-5 p-8 sm:p-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400/90">{p.market} · CSV demo</p>
              <h1 className="font-display mt-3 text-2xl font-medium leading-tight text-white sm:text-3xl">{title}</h1>
              {p.title?.ar && p.title.ar !== p.title.en ? (
                <p className="mt-3 text-base leading-relaxed text-slate-400" dir="rtl">
                  {p.title.ar}
                </p>
              ) : null}
            </div>

            <dl className="grid gap-3 text-sm text-slate-300">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-slate-500">SKU</dt>
                <dd className="font-mono text-slate-200">{p.sku}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-slate-500">Product ID</dt>
                <dd className="font-mono text-slate-200">{p.product_id}</dd>
              </div>
              {p.attrs?.retrieval_category_label || p.attrs?.retrieval_category ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Merch bucket</dt>
                  <dd className="font-mono text-[13px] text-slate-200">
                    {p.attrs?.retrieval_category_label ?? p.attrs?.retrieval_category}
                  </dd>
                </div>
              ) : null}
              {p.attrs?.customer_group ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Customer group</dt>
                  <dd>{p.attrs.customer_group}</dd>
                </div>
              ) : null}
              {p.attrs?.color ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Colour</dt>
                  <dd>{p.attrs.color}</dd>
                </div>
              ) : null}
              {p.attrs?.size ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Size</dt>
                  <dd>{p.attrs.size}</dd>
                </div>
              ) : null}
              {priceBits.length ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-slate-500">Price</dt>
                  <dd className="text-teal-200/95">{priceBits.join(" · ")}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-slate-500">Availability</dt>
                <dd className={p.availability !== false ? "text-emerald-300" : "text-rose-400"}>
                  {p.availability !== false ? "Available" : "Unavailable"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {images.length > 1 ? (
          <div className="border-t border-white/10 bg-black/40 px-8 py-6">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">More imagery</p>
            <ul className="flex gap-3 overflow-x-auto pb-2">
              {images.slice(1, 13).map((src) => (
                <li key={src} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-white/10">
                  <Image src={src} alt="" fill className="object-cover" sizes="112px" unoptimized />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {related.length > 0 ? (
        <section className="mt-14" aria-labelledby="related-heading">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="related-heading" className="font-display text-xl font-medium text-white sm:text-2xl">
                You may also like
              </h2>
              <p className="mt-1 max-w-xl text-sm text-slate-400">
                Picks from the same merch bucket plus light keyword overlap on the static demo catalog.
              </p>
            </div>
            <Link
              href={`/?q=${encodeURIComponent(canonicalSearchQ)}#experience`}
              className="text-sm font-medium text-teal-300/95 transition hover:text-teal-200"
            >
              Open in NL search →
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => {
              const rTitle = r.title?.en || r.title?.ar || r.sku;
              const thumb = Array.isArray(r.images) ? r.images.map(imgUrl).filter(Boolean)[0] : undefined;
              const pid = String(r.product_id);
              const price =
                r.pricing?.aed != null
                  ? `${r.pricing.aed} AED`
                  : r.pricing?.sar != null
                    ? `${r.pricing.sar} SAR`
                    : null;
              return (
                <li key={pid}>
                  <Link
                    href={`/product/${encodeURIComponent(pid)}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 transition hover:border-teal-500/35 hover:bg-slate-900/80"
                  >
                    <div className="relative aspect-[4/3] bg-black/50">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt=""
                          fill
                          className="object-cover transition group-hover:opacity-95"
                          sizes="(max-width:640px)100vw,25vw"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-600">No image</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-100">{rTitle}</p>
                      {price ? <p className="text-xs text-teal-200/90">{price}</p> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
