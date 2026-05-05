/**
 * Build Step: apps/showcase/data/catalog.csv → apps/showcase/lib/demo-catalog.json
 * Run from repo root via: node scripts/generate-demo-catalog-from-csv.mjs
 * Or automatically: npm run build in apps/showcase (prebuild hook).
 *
 * Env: SHOWCASE_CATALOG_CSV=absolute-or-repo-relative path overrides default.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "csv-parse/sync";

const __root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_CSV = join(__root, "apps/showcase/data/catalog.csv");
const OUT_DIR = join(__root, "apps/showcase/lib");
const OUT_FILE = join(OUT_DIR, "demo-catalog.json");

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
  "image_links": "image_links",
  images: "image_links",
  url: "image_links",
  image: "image_links",
  color: "color",
  size: "size",
  "country of origin": "country_of_origin",
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
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function parsePrice(s) {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
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

function main() {
  const csvPath = process.env.SHOWCASE_CATALOG_CSV
    ? isAbsolute(process.env.SHOWCASE_CATALOG_CSV)
      ? process.env.SHOWCASE_CATALOG_CSV
      : join(__root, process.env.SHOWCASE_CATALOG_CSV)
    : DEFAULT_CSV;

  if (!existsSync(csvPath)) {
    console.warn(`[demo-catalog] No CSV at ${csvPath} — writing empty catalog. Add apps/showcase/data/catalog.csv and redeploy.`);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      OUT_FILE,
      JSON.stringify({ generatedAt: new Date().toISOString(), rowCount: 0, products: [] }, null, 2),
      "utf8",
    );
    return;
  }

  const raw = readFileSync(csvPath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  });

  /** @type {unknown[]} */
  const products = [];
  for (const rawRow of rows) {
    const aliased = aliasRow(/** @type {Record<string, string>} */ (rawRow));
    const p = rowToProduct(aliased);
    if (p) products.push(p);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    rowCount: products.length,
    products,
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[demo-catalog] Wrote ${products.length} products → ${OUT_FILE}`);
}

main();
