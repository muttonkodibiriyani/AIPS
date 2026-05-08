/**
 * Build Step: apps/showcase/data/catalog.csv → apps/showcase/lib/demo-catalog.json
 *
 * Env:
 *   SHOWCASE_CATALOG_CSV — path to CSV (default: apps/showcase/data/catalog.csv).
 *   SHOWCASE_DEMO_ROW_LIMIT — max products; 0/unset with small file = all rows; large file auto cap.
 *     For ~200k–300k+ variants keep the CSV local and set SHOWCASE_DEMO_ROW_LIMIT (expect a large JSON + build time);
 *     production search should use the gateway + OpenSearch for full-catalog recall.
 *   SHOWCASE_DEMO_SEGMENT — any | men | women | kids (default: any).
 *     Uses H&M-style HNMDefault~customerGroup (Man/Woman/Boy/Girl / combos).
 *   SHOWCASE_DEMO_STRATIFY — true | false (default true when row cap applies). Targets a balanced merch mix
 *     (home, footwear, tops, bottoms, …) instead of one random slice of rows.
 *   SHOWCASE_DEMO_MERCH_ONLY — slug: keep rows in that merchandising bucket only (see CATEGORY_TARGET_FRACTIONS keys
 *     in apps/showcase/lib/merch-category.mjs). Example: footwear_sandals_slides for “sandals-only” demo.
 *     Row budget: SHOWCASE_DEMO_ROW_LIMIT if set; else SHOWCASE_DEMO_MERCH_SOFT_CAP (default 200000);
 *     set SHOWCASE_DEMO_MERCH_UNLIMITED=1 to ingest every CSV row matching the slug (very large JSON possible).
 *
 * Remote CSV (no git commit of 200k demo JSON — regenerate on every build):
 *   SHOWCASE_CATALOG_URL — HTTPS URL to **plain CSV** or **.csv.gz** (gzip); if gzip, builder decompresses stream to
 *     SHOWCASE_CATALOG_DOWNLOAD_PATH (default apps/showcase/data/.catalog-fetched.csv). Host the gzip on Releases,
 *     R2, Blob — set URL in Vercel env.
 *   SHOWCASE_CATALOG_FETCH_IF_MISSING_ONLY — 1 = skip re-download when cached file exists.
 *   SHOWCASE_CATALOG_FETCH_AUTH — optional Authorization header (e.g. Bearer …).
 *   SHOWCASE_CATALOG_FETCH_HEADERS — optional JSON merged into fetch headers.
 *   SHOWCASE_CATALOG_FETCH_TIMEOUT_MS — default 7200000 (large exports).
 *   SHOWCASE_MERGE_LEXICON_SLICES — true|false (default true). When true, merge NDJSON from batch jobs into each product search_text.
 *   SHOWCASE_LEXICON_SLICES_PATH — optional path to `.catalog-lexicon-slices.ndjson`.
 *   SHOWCASE_LEXICON_MERGE_CHAR_CAP — max chars of merged lexicon (default 5500).
 */
import { statSync, mkdirSync, writeFileSync, readFileSync, existsSync, createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { createGunzip } from "node:zlib";

import {
  CATEGORY_TARGET_FRACTIONS,
  computeCategoryTargets,
  inferMerchCategorySlug,
} from "../apps/showcase/lib/merch-category.mjs";
import { parse } from "csv-parse";

const __root = join(dirname(fileURLToPath(import.meta.url)), "..");

const LEXICON_SLICES_DEFAULT = join(__root, "apps/showcase/data/.catalog-lexicon-slices.ndjson");

/** Accumulated NDJSON slices from scripts/catalog-lexicon-batch.mjs — broadens searchable text globally. */
function loadAccumulatedLexiconForSearch() {
  const v = String(process.env.SHOWCASE_MERGE_LEXICON_SLICES ?? "true").toLowerCase();
  if (v === "false" || v === "0") return "";

  const p = String(process.env.SHOWCASE_LEXICON_SLICES_PATH ?? LEXICON_SLICES_DEFAULT).trim();
  const path = isAbsolute(p) ? p : join(__root, p);
  if (!existsSync(path)) return "";

  const cap = parseInt(String(process.env.SHOWCASE_LEXICON_MERGE_CHAR_CAP ?? "5500"), 10);
  const maxChars = Number.isFinite(cap) && cap > 200 ? Math.min(cap, 30_000) : 5500;

  /** @type {Set<string>} */
  const uniq = new Set();
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      const tk = typeof o.tokens === "string" ? o.tokens.toLowerCase() : "";
      for (const piece of tk.split(/\s+/)) if (piece.length > 2) uniq.add(piece);
    } catch {
      /* ignore bad line */
    }
  }

  let out = [...uniq].join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  if (out.length > maxChars) out = out.slice(0, maxChars);
  return out.replace(/\s+$/u, "").trim();
}

const DEFAULT_CSV = join(__root, "apps/showcase/data/catalog.csv");
const OUT_DIR = join(__root, "apps/showcase/lib");
const OUT_FILE = join(OUT_DIR, "demo-catalog.json");

const LARGE_CSV_BYTES = 20 * 1024 * 1024;
/** Large CSV default: stratified reservoir across **all** merch slugs (`CATEGORY_TARGET_FRACTIONS`). */
const DEFAULT_CAP_FOR_LARGE_CSV = 200_000;
/** Merch-only mode soft cap when `SHOWCASE_DEMO_ROW_LIMIT` is unset. */
const DEFAULT_MERCH_SOFT_CAP = 200_000;

const DEFAULT_FETCH_DEST = join(__root, "apps/showcase/data/.catalog-fetched.csv");

function resolvedLocalCsvPath() {
  if (process.env.SHOWCASE_CATALOG_CSV && String(process.env.SHOWCASE_CATALOG_CSV).trim()) {
    const p = String(process.env.SHOWCASE_CATALOG_CSV).trim();
    return isAbsolute(p) ? p : join(__root, p);
  }
  return DEFAULT_CSV;
}

/** When local path or fetch target is gzip, pipe through gunzip before csv-parse. */
function csvReadStreamForPath(csvPath) {
  const s = createReadStream(csvPath);
  const lower = String(csvPath).toLowerCase();
  if (lower.endsWith(".gz")) {
    return s.pipe(createGunzip());
  }
  return s;
}

/** Stream HTTP body to disk — if URL or server looks like gzip, decompress to plain UTF-8 CSV at destPath. */
async function downloadCatalogFromUrl(urlStr, destPath) {
  const tm = parseInt(String(process.env.SHOWCASE_CATALOG_FETCH_TIMEOUT_MS || "7200000"), 10);
  const ms = Number.isFinite(tm) && tm > 0 ? tm : 7200000;

  /** @type {Record<string, string>} */
  const headers = {};
  const auth = String(process.env.SHOWCASE_CATALOG_FETCH_AUTH ?? "").trim();
  if (auth) headers.Authorization = auth;
  const extra = String(process.env.SHOWCASE_CATALOG_FETCH_HEADERS ?? "").trim();
  if (extra) {
    try {
      Object.assign(headers, JSON.parse(extra));
    } catch {
      console.warn("[demo-catalog] SHOWCASE_CATALOG_FETCH_HEADERS invalid JSON — ignored.");
    }
  }

  console.warn("[demo-catalog] Streaming SHOWCASE_CATALOG_URL →", destPath);
  const res = await fetch(urlStr, {
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`Catalog fetch HTTP ${res.status}`);
  if (!res.body) throw new Error("Catalog fetch: empty body");
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  let urlGz = false;
  try {
    urlGz = /\.gz($|\?)/i.test(new URL(urlStr).pathname);
  } catch {
    /* ignore */
  }
  const useGunzip = urlGz || ctype.includes("gzip");

  const webIn = Readable.fromWeb(res.body);
  if (useGunzip) {
    await pipeline(webIn, createGunzip(), createWriteStream(destPath));
  } else {
    await pipeline(webIn, createWriteStream(destPath));
  }
}

/**
 * Prefer `SHOWCASE_CATALOG_URL` so each build can ingest the latest export without committing JSON to Git.
 * @returns {Promise<string>}
 */
async function resolveEffectiveCatalogPath() {
  const fetchUrl = String(process.env.SHOWCASE_CATALOG_URL ?? "").trim();
  if (!fetchUrl) return resolvedLocalCsvPath();

  const destRaw = String(process.env.SHOWCASE_CATALOG_DOWNLOAD_PATH ?? "").trim();
  const dest = destRaw ? (isAbsolute(destRaw) ? destRaw : join(__root, destRaw)) : DEFAULT_FETCH_DEST;

  const ifMissingOnly = ["1", "true", "yes"].includes(
    String(process.env.SHOWCASE_CATALOG_FETCH_IF_MISSING_ONLY ?? "").toLowerCase(),
  );

  mkdirSync(dirname(dest), { recursive: true });
  if (!ifMissingOnly || !existsSync(dest)) await downloadCatalogFromUrl(fetchUrl, dest);
  else console.warn("[demo-catalog] Reusing cached file (SHOWCASE_CATALOG_FETCH_IF_MISSING_ONLY):", dest);

  return dest;
}

function normalizeMerchSlug(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function resolveMerchOnlySlug() {
  const v = normalizeMerchSlug(process.env.SHOWCASE_DEMO_MERCH_ONLY);
  if (!v) return null;
  const keys = Object.keys(CATEGORY_TARGET_FRACTIONS);
  if (!keys.includes(v)) {
    console.warn(
      `[demo-catalog] SHOWCASE_DEMO_MERCH_ONLY="${process.env.SHOWCASE_DEMO_MERCH_ONLY}" is not one of (${keys.join(", ")}); still filtering by inferred slug.`,
    );
  }
  return v;
}

const HEADER_ALIASES = /** @type {Record<string, string>} */ ({
  id: "product_id",
  product_id: "product_id",
  sku: "sku",
  "sku (part number)": "sku",
  name: "name_en",
  "name (ar)": "name_ar",
  "long description": "desc_en",
  "long description (ar)": "desc_ar",
  composition: "composition",
  "image links": "image_links",
  image_links: "image_links",
  images: "image_links",
  url: "image_links",
  image: "image_links",
  color: "color",
  size: "size",
  "country of origin": "country_of_origin",
  "hnmdefault~customergroup": "customer_group",
  "price ae": "price_ae",
  "price sa": "price_sa",
  "price.ae": "price_ae",
  "price.sa": "price_sa",
  "pricing.ae": "price_ae",
  "pricing.sa": "price_sa",
  market: "market",
  availability: "availability",
  brand: "brand",
  category: "category",
  barcode: "barcode",
});

function normHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** @param {Record<string, string>} rawRow */
function aliasRow(rawRow) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(rawRow)) {
    if (v == null || String(v).trim() === "") continue;
    const nk = normHeader(k);
    const internal = HEADER_ALIASES[nk] ?? nk.replace(/\s+/g, "_");
    out[internal] = String(v).trim();
  }
  return out;
}

function splitImages(links) {
  if (!links) return [];
  return String(links)
    .split(/[|;,\n]+/g)
    .map((s) =>
      String(s)
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/,\s*$/, ""),
    )
    .filter(Boolean)
    .slice(0, 24);
}

function parsePrice(s) {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** @param {string} raw */
function customerGroupTokens(raw) {
  return String(raw || "")
    .split(/[|,\/\s]+/g)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * @param {Record<string, string>} row — aliased
 * @param {string} segment — men | women | kids | any
 */
function matchesSegment(row, segment) {
  if (segment === "any") return true;
  const raw = row.customer_group || "";
  const t = customerGroupTokens(raw);
  if (t.length === 0) return false;

  const hasMan = t.some((x) => x === "MAN" || x === "MEN" || x === "MENS" || x === "MEN'S");
  const hasWoman = t.some((x) => x === "WOMAN" || x === "WOMEN" || x === "LADIES");
  const hasBoy = t.includes("BOY");
  const hasGirl = t.includes("GIRL");
  const onlyChildTokens = (hasBoy || hasGirl) && !hasMan && !hasWoman;

  if (segment === "men") {
    if (onlyChildTokens) return false;
    return hasMan;
  }
  if (segment === "women") {
    if (onlyChildTokens) return false;
    return hasWoman;
  }
  if (segment === "kids") {
    return onlyChildTokens || t.some((x) => /^(BABY|CHILD|KID|JUNIOR|TODDLER|INFANT)$/.test(x));
  }
  return true;
}

/** Uniform reservoir sample: after stream, arr has min(k, seen) elements */
function reservoirAdd(arr, item, k, seenCount) {
  if (arr.length < k) {
    arr.push(item);
    return;
  }
  const j = Math.floor(Math.random() * seenCount);
  if (j < k) arr[j] = item;
}

/** @param {Record<string, string>} row */
/** @param {string | null | undefined} merchSlug — inferred stratified retrieval bucket */
function rowToProduct(row, merchSlug) {
  const productId = row.product_id || row.id;
  const sku = row.sku;
  if (!productId && !sku) return null;
  const pid = productId || sku;

  const nameEn = row.name_en || "";
  const nameAr = row.name_ar || "";
  const descEn = row.desc_en || "";
  const descAr = row.desc_ar || "";

  const attrs = {};
  if (row.color) attrs.color = row.color.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  if (row.size) attrs.size = row.size;
  if (row.country_of_origin) attrs.country_of_origin = row.country_of_origin;
  if (row.brand) attrs.brand = row.brand;
  if (row.category) attrs.category = row.category;
  if (row.customer_group) attrs.customer_group = row.customer_group.trim();
  if (merchSlug) {
    attrs.retrieval_category = merchSlug;
    attrs.retrieval_category_label = String(merchSlug).replace(/_/g, " ");
  }

  const pricing = {};
  const pae = parsePrice(row.price_ae);
  const psa = parsePrice(row.price_sa);
  if (pae != null) pricing.aed = pae;
  if (psa != null) pricing.sar = psa;

  const market = ((row.market || "AE").slice(0, 3) || "AE").toUpperCase();
  const safeMarket = market.length > 3 ? "AE" : market;

  let availability = true;
  if (row.availability) {
    const a = row.availability.toLowerCase();
    availability = !["0", "false", "no", "out", "inactive"].includes(a);
  }

  const images = splitImages(row.image_links);

  const searchText = [
    nameEn,
    nameAr,
    descEn,
    descAr,
    row.color || "",
    row.brand || "",
    row.sku || "",
    pid,
    row.composition || "",
    row.customer_group || "",
    merchSlug || "",
    merchSlug ? String(merchSlug).replace(/_/g, " ") : "",
  ]
    .join(" ")
    .toLowerCase();

  return {
    tenant_id: row.tenant_id_hint || "csv-demo",
    product_id: pid,
    sku: sku || pid,
    market: safeMarket,
    title: {
      en: nameEn || nameAr || sku || pid,
      ar: nameAr || nameEn || sku || pid,
    },
    attrs,
    pricing,
    images,
    availability,
    search_text: searchText.slice(0, 8000),
    _score: 0,
  };
}

/** Row cap builds default to stratified category mix unless disabled. */
function useStratifiedSampling(maxRows) {
  if (maxRows == null) return false;
  const v = (process.env.SHOWCASE_DEMO_STRATIFY ?? "true").trim().toLowerCase();
  return !(v === "false" || v === "0");
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** @param {number | null} maxRows */
function resolveSegment(maxRows) {
  const raw = (process.env.SHOWCASE_DEMO_SEGMENT ?? "").trim().toLowerCase();
  if (raw === "any" || raw === "men" || raw === "women" || raw === "kids") return raw;
  if (maxRows != null) return "any";
  return "any";
}

/** @param {number} bytes */
function resolveRowLimit(bytes, merchOnlySlug) {
  const raw = process.env.SHOWCASE_DEMO_ROW_LIMIT;
  if (raw !== undefined && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }
  if (merchOnlySlug) {
    const unlimited = ["1", "true", "yes"].includes(
      (process.env.SHOWCASE_DEMO_MERCH_UNLIMITED ?? "").trim().toLowerCase(),
    );
    if (unlimited) {
      console.warn("[demo-catalog] SHOWCASE_DEMO_MERCH_UNLIMITED: emitting every SKU in category (heavy).");
      return null;
    }
    const soft = parseInt(String(process.env.SHOWCASE_DEMO_MERCH_SOFT_CAP ?? DEFAULT_MERCH_SOFT_CAP), 10);
    const cap = Number.isFinite(soft) && soft > 0 ? soft : DEFAULT_MERCH_SOFT_CAP;
    console.warn(
      `[demo-catalog] Merch-only cap ${cap.toLocaleString()} SKUs — set SHOWCASE_DEMO_ROW_LIMIT or SHOWCASE_DEMO_MERCH_UNLIMITED=1 to override.`,
    );
    return cap;
  }
  if (bytes > LARGE_CSV_BYTES) return DEFAULT_CAP_FOR_LARGE_CSV;
  return null;
}

/**
 * @param {string} csvPath
 * @param {number | null} maxRows — null = unlimited (no reservoir bound)
 * @param {string} segment
 * @param {string | null} merchOnlySlug
 */
async function streamCsvToProducts(csvPath, maxRows, segment, merchOnlySlug) {
  if (merchOnlySlug) {
    return streamCsvMerchCategoryOnly(csvPath, maxRows, segment, merchOnlySlug);
  }
  const stratify = useStratifiedSampling(maxRows);
  if (!stratify) {
    return streamCsvUniformReservoir(csvPath, maxRows, segment);
  }
  return streamCsvStratifiedReservoir(csvPath, /** @type {number} */ (maxRows), segment);
}

/** @param {string} csvPath @param {number | null} maxRows @param {string} segment @param {string} targetSlug */
async function streamCsvMerchCategoryOnly(csvPath, maxRows, segment, targetSlug) {
  const parser = csvReadStreamForPath(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  /** @type {unknown[]} */
  const primary = [];
  let seenInSlug = 0;
  let seenSegmentRows = 0;

  for await (const rawRow of parser) {
    const aliased = aliasRow(/** @type {Record<string, string>} */ (rawRow));

    let ok = segment === "any";
    if (segment !== "any") ok = matchesSegment(aliased, segment);
    if (!ok) continue;

    seenSegmentRows++;
    const nameEn = aliased.name_en || "";
    const descSnip = (aliased.desc_en || "").slice(0, 520);
    const inferred = inferMerchCategorySlug(nameEn, descSnip);
    if (inferred !== targetSlug) continue;

    const p = rowToProduct(aliased, targetSlug);
    if (!p) continue;

    seenInSlug++;
    if (maxRows == null) {
      primary.push(p);
    } else {
      reservoirAdd(primary, p, maxRows, seenInSlug);
    }
  }

  const segmentUnderfilled = segment !== "any" && maxRows != null && primary.length < maxRows;
  return {
    products: primary,
    segmentUnderfilled,
    seenSegment: seenSegmentRows,
    stratified: false,
    seats: { [targetSlug]: primary.length },
  };
}

/** @param {string} csvPath @param {number | null} maxRows @param {string} segment */
async function streamCsvUniformReservoir(csvPath, maxRows, segment) {
  const parser = csvReadStreamForPath(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  /** @type {unknown[]} */
  const primary = [];
  let matchedRows = 0;

  for await (const rawRow of parser) {
    const aliased = aliasRow(/** @type {Record<string, string>} */ (rawRow));

    let ok = segment === "any";
    if (segment !== "any") ok = matchesSegment(aliased, segment);
    if (!ok) continue;

    const slug = inferMerchCategorySlug(aliased.name_en || "", (aliased.desc_en || "").slice(0, 520));
    const p = rowToProduct(aliased, slug);
    if (!p) continue;

    matchedRows++;
    if (maxRows == null) {
      primary.push(p);
    } else {
      reservoirAdd(primary, p, maxRows, matchedRows);
    }
  }

  const products = primary;
  const segmentUnderfilled = segment !== "any" && maxRows != null && primary.length < maxRows;
  return { products, segmentUnderfilled, seenSegment: matchedRows, stratified: false, seats: null };
}

/** @param {string} csvPath @param {number} maxRows @param {string} segment */
async function streamCsvStratifiedReservoir(csvPath, maxRows, segment) {
  const seats = computeCategoryTargets(maxRows);
  /** @type {Record<string, unknown[]>} */
  const buckets = {};
  /** @type {Record<string, number>} */
  const seenBucket = {};
  const seatKeys = Object.keys(seats);
  for (const k of seatKeys) {
    buckets[k] = [];
    seenBucket[k] = 0;
  }

  /** @type {unknown[]} */
  let overflow = [];
  let overflowSeen = 0;
  let seenSegmentRows = 0;

  const parser = csvReadStreamForPath(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  for await (const rawRow of parser) {
    const aliased = aliasRow(/** @type {Record<string, string>} */ (rawRow));

    let ok = segment === "any";
    if (segment !== "any") ok = matchesSegment(aliased, segment);
    if (!ok) continue;

    const nameEn = aliased.name_en || "";
    const descSnip = (aliased.desc_en || "").slice(0, 520);
    const inferred = inferMerchCategorySlug(nameEn, descSnip);
    const bucketKey = Object.prototype.hasOwnProperty.call(seats, inferred) ? inferred : "other";
    const cap = seats[bucketKey] ?? seats.other;

    const p = rowToProduct(aliased, bucketKey);
    if (!p) continue;

    seenSegmentRows++;

    seenBucket[bucketKey]++;
    if (buckets[bucketKey].length < cap) {
      reservoirAdd(buckets[bucketKey], p, cap, seenBucket[bucketKey]);
    } else {
      overflowSeen++;
      reservoirAdd(overflow, p, maxRows, overflowSeen);
    }
  }

  let products = interleaveBuckets(buckets, seatKeys);
  if (products.length < maxRows && overflow.length > 0) {
    shuffleInPlace(overflow);
    products = products.concat(overflow.slice(0, maxRows - products.length));
  }

  const segmentUnderfilled = segment !== "any" && products.length < maxRows;
  return {
    products,
    segmentUnderfilled,
    seenSegment: seenSegmentRows,
    stratified: true,
    seats,
  };
}

/** Interleave strata so grids are not grouped only by merchandising bucket. */
function interleaveBuckets(buckets, seatKeys) {
  const maxR = Math.max(0, ...seatKeys.map((k) => (buckets[k] ?? []).length));
  /** @type {unknown[]} */
  const out = [];
  for (let r = 0; r < maxR; r++) {
    for (const k of seatKeys) {
      const row = buckets[k][r];
      if (row) out.push(row);
    }
  }
  return out;
}

async function main() {
  let csvPath = "";
  try {
    csvPath = await resolveEffectiveCatalogPath();
  } catch (e) {
    console.error("[demo-catalog] Remote/catalog resolution failed:", e);
    csvPath = resolvedLocalCsvPath();
    if (!existsSync(csvPath)) {
      console.error("[demo-catalog] No local CSV fallback.");
      process.exit(1);
    }
    console.warn("[demo-catalog] Using local CSV after fetch error:", csvPath);
  }

  if (!existsSync(csvPath)) {
    if (existsSync(OUT_FILE)) {
      try {
        const cur = JSON.parse(readFileSync(OUT_FILE, "utf8"));
        const n = Array.isArray(cur?.products) ? cur.products.length : 0;
        console.warn(`[demo-catalog] No CSV at ${csvPath} — keeping committed ${OUT_FILE} (${n} products).`);
        return;
      } catch {
        /* fall through — rewrite empty */
      }
    }
    console.warn(`[demo-catalog] No CSV at ${csvPath} — writing empty catalog. Add CSV locally or commit demo-catalog.json.`);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      OUT_FILE,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          rowCount: 0,
          products: [],
          buildMeta: { empty: true, csvPathRelative: csvPath.replace(__root + "\\", "").replace(__root + "/", "") },
        },
        null,
        2,
      ),
      "utf8",
    );
    return;
  }

  let bytes = 0;
  try {
    bytes = statSync(csvPath).size;
  } catch {
    bytes = 0;
  }

  const merchOnlySlug = resolveMerchOnlySlug();
  const maxRows = resolveRowLimit(bytes, merchOnlySlug);
  const segment = resolveSegment(maxRows);
  const {
    products,
    segmentUnderfilled,
    seenSegment,
    stratified,
    seats,
  } = await streamCsvToProducts(csvPath, maxRows, segment, merchOnlySlug);

  const bulkLex = loadAccumulatedLexiconForSearch();
  if (bulkLex) {
    for (const p of products) {
      const merged = `${String(p.search_text ?? "")} ${bulkLex}`;
      p.search_text = merged.replace(/\s+/g, " ").trim().slice(0, 9500);
    }
    console.warn(`[demo-catalog] Merged accumulated batch lexicon (~${bulkLex.length} pooled chars) into search_text.`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    rowCount: products.length,
    products,
    buildMeta: {
      csvApproxBytes: bytes,
      limitApplied: maxRows,
      truncated: maxRows != null && products.length >= maxRows,
      segment,
      merchOnlySlug,
      catalogSource: process.env.SHOWCASE_CATALOG_URL ? "remote_url" : "local_path",
      reservoirSampling: maxRows != null && !stratified,
      stratifiedCategoryMix: stratified,
      categorySeatPlan: stratified ? seats : null,
      segmentUnderfilled,
      rowsSeenInSegment: seenSegment,
      lexiconMerged: Boolean(bulkLex),
      lexiconMergedCharsApprox: bulkLex.length || 0,
      hint: merchOnlySlug
        ? `Merch-only ${merchOnlySlug}: ${products.length.toLocaleString()} SKUs (limit ${maxRows == null ? "none" : maxRows.toLocaleString()}). Full catalog: gateway + OpenSearch.`
        : maxRows != null
          ? stratified
            ? `Capped demo (${segment}): stratified mix across apparel/home buckets (~${maxRows.toLocaleString()} SKUs). For full fidelity use ingest + COMMERCE_GATEWAY_URL + OpenSearch.`
            : `Capped demo (${segment}): single-stream reservoir (~${maxRows.toLocaleString()} SKUs). Set SHOWCASE_DEMO_STRATIFY=true for category-balanced demo. Full catalog search: ingest + gateway.`
          : null,
    },
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload), "utf8");
  const stratLabel = stratified ? ", stratified" : "";
  const merchLabel = merchOnlySlug ? `, merch=${merchOnlySlug}` : "";
  const u = segmentUnderfilled ? " — fewer than cap rows matched this segment." : "";
  console.log(
    `[demo-catalog] Wrote ${products.length.toLocaleString()} products → ${OUT_FILE}` +
      (maxRows ? ` (cap ${maxRows.toLocaleString()}, segment=${segment}${merchLabel}${stratLabel})` : ` (segment=${segment}${merchLabel}, full read)`) +
      u,
  );
}

main().catch((e) => {
  console.error("[demo-catalog] Failed:", e);
  process.exit(1);
});
