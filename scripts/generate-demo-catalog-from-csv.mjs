/**
 * Build Step: apps/showcase/data/catalog.csv → apps/showcase/lib/demo-catalog.json
 *
 * Env:
 *   SHOWCASE_CATALOG_CSV — path to CSV (default: apps/showcase/data/catalog.csv).
 *   SHOWCASE_DEMO_ROW_LIMIT — max products; 0/unset with small file = all rows; large file auto cap 25k.
 *   SHOWCASE_DEMO_SEGMENT — any | men | women | kids (default: men when row cap applies, else any).
 *     Uses H&M-style HNMDefault~customerGroup (Man/Woman/Boy/Girl / combos).
 */
import { statSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "csv-parse";

const __root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_CSV = join(__root, "apps/showcase/data/catalog.csv");
const OUT_DIR = join(__root, "apps/showcase/lib");
const OUT_FILE = join(OUT_DIR, "demo-catalog.json");

const LARGE_CSV_BYTES = 20 * 1024 * 1024;
const DEFAULT_CAP_FOR_LARGE_CSV = 25_000;

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
function rowToProduct(row) {
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

/** @param {number | null} maxRows */
function resolveSegment(maxRows) {
  const raw = (process.env.SHOWCASE_DEMO_SEGMENT ?? "").trim().toLowerCase();
  if (raw === "any" || raw === "men" || raw === "women" || raw === "kids") return raw;
  if (maxRows != null) return "men";
  return "any";
}

/** @param {string | undefined} raw */
function resolveRowLimit(csvPath, bytes) {
  const raw = process.env.SHOWCASE_DEMO_ROW_LIMIT;
  if (raw !== undefined && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }
  if (bytes > LARGE_CSV_BYTES) return DEFAULT_CAP_FOR_LARGE_CSV;
  return null;
}

/**
 * @param {string} csvPath
 * @param {number | null} maxRows — null = unlimited
 * @param {string} segment
 */
async function streamCsvToProducts(csvPath, maxRows, segment) {
  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  /** @type {unknown[]} */
  const primary = [];
  let seenPrimary = 0;

  for await (const rawRow of parser) {
    const aliased = aliasRow(/** @type {Record<string, string>} */ (rawRow));
    const p = rowToProduct(aliased);
    if (!p) continue;

    if (segment === "any") {
      if (maxRows == null) {
        primary.push(p);
      } else {
        seenPrimary++;
        reservoirAdd(primary, p, maxRows, seenPrimary);
      }
      continue;
    }

    if (!matchesSegment(aliased, segment)) continue;

    if (maxRows == null) {
      primary.push(p);
    } else {
      seenPrimary++;
      reservoirAdd(primary, p, maxRows, seenPrimary);
    }
  }

  /** @type {unknown[]} */
  const products = primary;
  const segmentUnderfilled = segment !== "any" && maxRows != null && primary.length < maxRows;

  return { products, segmentUnderfilled, seenSegment: seenPrimary };
}

async function main() {
  const csvPath = process.env.SHOWCASE_CATALOG_CSV
    ? isAbsolute(process.env.SHOWCASE_CATALOG_CSV)
      ? process.env.SHOWCASE_CATALOG_CSV
      : join(__root, process.env.SHOWCASE_CATALOG_CSV)
    : DEFAULT_CSV;

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

  const maxRows = resolveRowLimit(csvPath, bytes);
  const segment = resolveSegment(maxRows);
  const { products, segmentUnderfilled, seenSegment } = await streamCsvToProducts(csvPath, maxRows, segment);

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
      reservoirSampling: maxRows != null,
      segmentUnderfilled,
      rowsSeenInSegment: seenSegment,
      hint:
        maxRows != null
          ? `Capped demo (${segment}): uniform random sample of up to ${maxRows.toLocaleString()} rows. Full-catalog search: ingest + COMMERCE_GATEWAY_URL.`
          : null,
    },
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload), "utf8");
  const u = segmentUnderfilled ? " — fewer than cap rows matched this segment." : "";
  console.log(
    `[demo-catalog] Wrote ${products.length.toLocaleString()} products → ${OUT_FILE}` +
      (maxRows ? ` (cap ${maxRows.toLocaleString()}, segment=${segment})` : ` (segment=${segment}, full read)`) +
      u,
  );
}

main().catch((e) => {
  console.error("[demo-catalog] Failed:", e);
  process.exit(1);
});
