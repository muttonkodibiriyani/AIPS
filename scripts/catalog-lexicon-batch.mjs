/**
 * Background-style batch worker: scans the merchant CSV in chunks (default 5k–10k *data rows*)
 * and appends LLM-derived (or heuristic) bulk search lexicon fragments to NDJSON slices.
 *
 * Intended for CI (GitHub Actions cache holds state + NDJSON). Each run advances `nextRowOffset`
 * so successive pushes gradually cover very large catalogs. Merge into SKU `search_text` happens
 * in `scripts/generate-demo-catalog-from-csv.mjs` when SHOWCASE_MERGE_LEXICON_SLICES is not false.
 *
 * Env:
 *   GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY — optional; without it the worker uses heuristic tokens only.
 *   GEMINI_MODEL — default gemini-2.0-flash
 *   SHOWCASE_CATALOG_CSV — override path
 *   SHOWCASE_CATALOG_URL — remote CSV (same contract as demo-catalog generator; optional header auth via existing env vars)
 *   CATALOG_LEX_BATCH_MIN — default 5000
 *   CATALOG_LEX_BATCH_MAX — default 10000 (actual batch size chosen uniformly at random inclusive)
 *   CATALOG_LEXICON_STATE_FILE — optional path to state JSON
 *   CATALOG_LEXICON_SLICES_FILE — optional path to NDJSON output
 *
 * Docs: commits only small state/slice files optionally; CI cache recommended (see workflow).
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
  createWriteStream,
  statSync,
} from "node:fs";
import { createReadStream } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import { parse } from "csv-parse";

const __root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(__root, "apps/showcase/data");

const DEFAULT_STATE = join(DATA, ".catalog-lexicon-state.json");
const DEFAULT_SLICES = join(DATA, ".catalog-lexicon-slices.ndjson");
const DEFAULT_FETCH = join(DATA, ".catalog-fetched.csv");
const DEFAULT_CSV = join(DATA, "catalog.csv");

/** @returns {number} pseudo-random in [min, max] inclusive from env bounds */
function pickBatchSize() {
  const lo = parseInt(String(process.env.CATALOG_LEX_BATCH_MIN ?? "5000"), 10);
  const hi = parseInt(String(process.env.CATALOG_LEX_BATCH_MAX ?? "10000"), 10);
  const a = Number.isFinite(lo) ? Math.min(200_000, Math.max(100, lo)) : 5000;
  const b = Number.isFinite(hi) ? Math.min(200_000, Math.max(a, hi)) : 10000;
  return a + Math.floor(Math.random() * (b - a + 1));
}

function fingerprintCsv(csvPath) {
  try {
    const st = statSync(csvPath);
    return `${st.size}_${Math.floor(st.mtimeMs)}`;
  } catch {
    return "missing";
  }
}

function csvReadStreamForPath(csvPath) {
  const s = createReadStream(csvPath);
  const lower = String(csvPath).toLowerCase();
  if (lower.endsWith(".gz")) return s.pipe(createGunzip());
  return s;
}

function normHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** @type {Record<string, string>} */
const HEADER_ALIASES = {
  name: "name_en",
  "name (ar)": "name_ar",
  id: "product_id",
  sku: "sku",
  "sku (part number)": "sku",
};

/** @param {Record<string, string>} rawRow */
function titleFromRaw(rawRow) {
  const out = {};
  for (const [k, v] of Object.entries(rawRow)) {
    if (v == null || String(v).trim() === "") continue;
    const nk = normHeader(k);
    const internal = HEADER_ALIASES[nk] ?? nk.replace(/\s+/g, "_");
    out[internal] = String(v).trim();
  }
  const t = out.name_en || out.name_ar || "";
  return t.slice(0, 240);
}

async function downloadCatalogFromUrl(urlStr, destPath) {
  const tm = parseInt(String(process.env.SHOWCASE_CATALOG_FETCH_TIMEOUT_MS || "7200000"), 10);
  const ms = Number.isFinite(tm) && tm > 0 ? tm : 7200000;
  /** @type {Record<string, string>} */
  const headers = {};
  const auth = String(process.env.SHOWCASE_CATALOG_FETCH_AUTH ?? "").trim();
  if (auth) headers.Authorization = auth;

  mkdirSync(dirname(destPath), { recursive: true });
  console.warn("[lexicon-batch] Fetching SHOWCASE_CATALOG_URL →", destPath);
  const res = await fetch(urlStr, { redirect: "follow", headers, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`Catalog fetch HTTP ${res.status}`);
  if (!res.body) throw new Error("empty body");

  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  let urlGz = false;
  try {
    urlGz = /\.gz($|\?)/i.test(new URL(urlStr).pathname);
  } catch {
    /* */
  }
  const useGunzip = urlGz || ctype.includes("gzip");
  const webIn = Readable.fromWeb(res.body);
  if (useGunzip) {
    await pipeline(webIn, createGunzip(), createWriteStream(destPath));
  } else {
    await pipeline(webIn, createWriteStream(destPath));
  }
}

async function resolveCsvPath() {
  const explicit = String(process.env.SHOWCASE_CATALOG_CSV ?? "").trim();
  if (explicit) {
    const p = isAbsolute(explicit) ? explicit : join(__root, explicit);
    if (existsSync(p)) return p;
    console.warn("[lexicon-batch] SHOWCASE_CATALOG_CSV missing on disk:", p);
  }

  const fetchUrl = String(process.env.SHOWCASE_CATALOG_URL ?? "").trim();
  if (fetchUrl) {
    const destRaw = String(process.env.SHOWCASE_CATALOG_DOWNLOAD_PATH ?? "").trim();
    const dest = destRaw ? (isAbsolute(destRaw) ? destRaw : join(__root, destRaw)) : DEFAULT_FETCH;
    const ifMissing = ["1", "true", "yes"].includes(
      String(process.env.SHOWCASE_CATALOG_FETCH_IF_MISSING_ONLY ?? "").toLowerCase(),
    );
    if (!ifMissing || !existsSync(dest)) await downloadCatalogFromUrl(fetchUrl, dest);
    return dest;
  }

  return DEFAULT_CSV;
}

/** @param {number} seed */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string[]} titles */
function heuristicLexicon(titles, cap = 900) {
  const freq = new Map();
  for (const raw of titles) {
    const s = String(raw).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/gi, " ");
    for (const w of s.split(/\s+/)) {
      if (w.length < 4) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  let out = "";
  for (const w of sorted) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > cap) break;
    out = next;
  }
  return out;
}

/**
 * @param {string} catalogSample — truncated title sample for the batch
 */
async function callGeminiLexicon(catalogSample, signal) {
  const key =
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim() || null;
  if (!key) return "";

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const prompt = `You broaden e-commerce lexical search coverage.
Below are sampled product titles from ONE chunk of the same CSV catalog (~thousands of nearby rows).
Respond with ONE JSON object only, no markdown.
Schema: { "bulk_search_lexicon": string }
Rules for bulk_search_lexicon:
- lowercase, space-separated synonym / shopper phrasing tokens only (fabrics, rooms, silhouettes, occasions).
- ASCII words preferred for EN catalog; omit prices, SKU codes, and brand inventions.
- max ~900 characters; no commas if possible (use spaces only).

TITLE SAMPLE:\n${catalogSample}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    }),
    signal,
  });
  if (!res.ok) {
    console.warn("[lexicon-batch] Gemini HTTP", res.status);
    return "";
  }
  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return "";
  let stripped = text.trim();
  if (stripped.startsWith("```")) {
    stripped = stripped.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/u, "").trim();
  }
  try {
    const o = JSON.parse(stripped);
    const lx = typeof o.bulk_search_lexicon === "string" ? o.bulk_search_lexicon.trim() : "";
    return lx.slice(0, 1200).toLowerCase();
  } catch {
    return "";
  }
}

function readState(statePath, fp) {
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    const offset = typeof raw.nextRowOffset === "number" && raw.nextRowOffset >= 0 ? raw.nextRowOffset : 0;
    const oldFp = typeof raw.catalogFingerprint === "string" ? raw.catalogFingerprint : "";
    return { offset: oldFp !== fp ? 0 : offset, fingerprint: fp };
  } catch {
    return { offset: 0, fingerprint: fp };
  }
}

function writeState(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}

async function main() {
  const csvPath = await resolveCsvPath();
  if (!existsSync(csvPath)) {
    console.warn("[lexicon-batch] Skip — no CSV at", csvPath, "(set SHOWCASE_CATALOG_CSV or SHOWCASE_CATALOG_URL).");
    return;
  }

  const statePath = String(process.env.CATALOG_LEXICON_STATE_FILE ?? DEFAULT_STATE).trim() || DEFAULT_STATE;
  const slicesPath = String(process.env.CATALOG_LEXICON_SLICES_FILE ?? DEFAULT_SLICES).trim() || DEFAULT_SLICES;
  mkdirSync(dirname(slicesPath), { recursive: true });

  const fp = fingerprintCsv(csvPath);
  const { offset: startOffset } = readState(statePath, fp);
  const BATCH = pickBatchSize();

  const parser = csvReadStreamForPath(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  /** @type {string[]} */
  const batchTitles = [];
  let rowIndex = 0;
  let hitBatchLimit = false;

  for await (const rawRow of parser) {
    const current = rowIndex++;
    if (current < startOffset) continue;

    const t = titleFromRaw(/** @type {Record<string, string>} */ (rawRow));
    if (t) batchTitles.push(t);

    if (current - startOffset + 1 >= BATCH) {
      hitBatchLimit = true;
      break;
    }
  }

  const sliceEndExclusive = rowIndex;
  const nextOffset = hitBatchLimit ? sliceEndExclusive : 0;

  if (rowIndex <= startOffset && batchTitles.length === 0) {
    console.warn("[lexicon-batch] CSV ended before startOffset — rewind cursor.");
    writeState(statePath, { nextRowOffset: 0, catalogFingerprint: fp, updatedAt: new Date().toISOString(), note: "eof_before_offset" });
    return;
  }

  if (batchTitles.length === 0) {
    console.warn("[lexicon-batch] No extractable titles — advance cursor.");
    writeState(statePath, {
      nextRowOffset: nextOffset,
      catalogFingerprint: fp,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const rnd = mulberry32((startOffset + 0x1234) >>> 0);
  const SAMPLE_MAX = Math.min(batchTitles.length, 160);
  const sampleIdx = [...Array(batchTitles.length).keys()].sort(() => rnd() - 0.5).slice(0, SAMPLE_MAX);
  const corpus = sampleIdx.map((i) => `- ${batchTitles[i]}`).join("\n").slice(0, 28_000);

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.min(120_000, parseInt(process.env.SHOWCASE_LLM_TIMEOUT_MS ?? "45000", 10) || 45000));

  let tokens = "";
  try {
    tokens = await callGeminiLexicon(corpus, ctl.signal);
  } catch {
    tokens = "";
  } finally {
    clearTimeout(t);
  }

  if (!tokens.trim()) tokens = heuristicLexicon(batchTitles);

  const record = {
    csvRowStart: startOffset,
    csvRowEndExclusive: sliceEndExclusive,
    rowsScannedInSlice: Math.max(0, sliceEndExclusive - startOffset),
    titleCount: batchTitles.length,
    tokens: tokens.trim().slice(0, 5000),
    at: new Date().toISOString(),
    heuristicOnly: !(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim(),
    batchComplete: hitBatchLimit,
  };

  appendFileSync(slicesPath, JSON.stringify(record) + "\n", "utf8");

  writeState(statePath, {
    nextRowOffset: nextOffset,
    catalogFingerprint: fp,
    batchSizeRequested: BATCH,
    updatedAt: new Date().toISOString(),
    lastSliceTitles: batchTitles.length,
  });

  console.log(
    `[lexicon-batch] rows ${startOffset}–${sliceEndExclusive} (n=${record.rowsScannedInSlice}) titles=${batchTitles.length} → slice appended; nextOffset=${nextOffset}`,
  );
}

main().catch((e) => {
  console.error("[lexicon-batch] Failed:", e);
  process.exit(1);
});
