/**
 * Temporary “gateway” for full-catalog search without Nest + OpenSearch:
 * serves POST /v1/search by loading a baked demo-catalog.json (from
 * `npm run showcase:demo-catalog`) and reuses the same lexical scorer as the
 * showcase CSV path.
 *
 * Run (repo root): npm install && npm run lexical-gateway
 * Point Vercel Showcase: COMMERCE_GATEWAY_URL=https://<your-host> COMMERCE_API_KEY=<same as LEXICAL_GATEWAY_API_KEY>
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { DemoCatalogFile, ProductRecord } from "../../showcase/lib/csv-demo-search.ts";
import * as csvDemo from "../../showcase/lib/csv-demo-search.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

function defaultCatalogPath(): string {
  return join(__dir, "../../showcase/lib/demo-catalog.json");
}

function resolvedCatalogPath(): string {
  const raw = process.env.LEXICAL_GATEWAY_CATALOG_JSON?.trim();
  if (raw) {
    return raw.startsWith("/") || /^[a-z]:\\/i.test(raw) ? raw : join(process.cwd(), raw);
  }
  return defaultCatalogPath();
}

/** Drop bulky search_text from responses unless debugging */
function optionallyStrip(products: ProductRecord[]): Record<string, unknown>[] {
  if (process.env.LEXICAL_GATEWAY_KEEP_SEARCH_TEXT === "true") {
    return products;
  }
  return products.map(({ search_text: _ignored, ...rest }) => rest);
}

function authOk(req: IncomingMessage): boolean {
  const want = process.env.LEXICAL_GATEWAY_API_KEY?.trim();
  if (!want) return true;
  const h = String(req.headers.authorization ?? "");
  return h === `Bearer ${want}`;
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (d) => chunks.push(Buffer.from(d)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handler(
  catalog: DemoCatalogFile,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = req.url ?? "/";

  if (req.method === "GET" && (url === "/health" || url === "/health/")) {
    const n = Array.isArray(catalog.products) ? catalog.products.length : 0;
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, service: "lexical-catalog-gateway", productsLoaded: n }));
    return;
  }

  if (req.method === "GET" && url.startsWith("/v1/autocomplete")) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ suggestions: [] }));
    return;
  }

  if (req.method === "POST" && (url === "/v1/search" || url.startsWith("/v1/search?"))) {
    if (!authOk(req)) {
      res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "unauthorized", message: "Invalid or missing Bearer token." }));
      return;
    }

    let body: Record<string, unknown>;
    try {
      const raw = await parseBody(req);
      body = (raw.trim() === "" ? {} : JSON.parse(raw)) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }

    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "demo-sl";
    const query = typeof body.query === "string" ? body.query : "";
    const pagination =
      body.pagination && typeof body.pagination === "object" && body.pagination !== null
        ? (body.pagination as { from?: number; size?: number })
        : {};
    const ctx = body.context && typeof body.context === "object" && body.context !== null ? body.context : {};

    const market = typeof (ctx as Record<string, unknown>).market === "string" ? String((ctx as Record<string, unknown>).market) : "AE";

    const result = csvDemo.searchCsvDemoCatalog(catalog, query, tenantId, pagination, {});

    const products = optionallyStrip(result.products);

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        products,
        facets: result.facets,
        total: result.total,
        interpretation: {
          lexicalWeight: 1,
          semanticWeight: 0,
        },
        appliedFilters: {
          ...result.appliedFilters,
          _lexicalCatalogGateway: true,
          market,
          hint: "Temporary lexical gateway — ingest to OpenSearch + real gateway for hybrid / scale.",
        },
      }),
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "not_found" }));
}

function main() {
  const path = resolvedCatalogPath();
  if (!existsSync(path)) {
    console.error(
      `[lexical-gateway] Missing catalog JSON: ${path}\n` +
        `  Build it from your CSV/gzip first (repo root), e.g.:\n` +
        `  SHOWCASE_DEMO_ROW_LIMIT=0 npm run showcase:demo-catalog\n` +
        `  Or set LEXICAL_GATEWAY_CATALOG_JSON to an absolute path.`,
    );
    process.exit(1);
  }

  console.warn(`[lexical-gateway] Loading catalog from ${path} …`);
  const raw = readFileSync(path, "utf8");
  const catalog = JSON.parse(raw) as DemoCatalogFile;
  const n = Array.isArray(catalog.products) ? catalog.products.length : 0;
  if (n === 0) {
    console.error("[lexical-gateway] Catalog has zero products.");
    process.exit(1);
  }
  console.warn(`[lexical-gateway] Loaded ${n.toLocaleString()} products`);

  const port = parseInt(String(process.env.PORT || "3040"), 10);
  const srv = createServer((req, res) => void handler(catalog, req, res));

  srv.listen(port, () => {
    console.warn(`[lexical-gateway] Listening on http://127.0.0.1:${port}  POST /v1/search`);
  });
}

main();
