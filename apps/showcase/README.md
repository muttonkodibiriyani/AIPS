# Showcase · leadership-ready Next.js frontend

Executive narrative + live **natural-language search** via **`POST /api/search`**.

## CSV demo (no Nest / no API key)

1. Replace **[`data/catalog.csv`](./data/catalog.csv)** with your UTF‑8 export (SKU, names, **image links**, colour, market, prices — aligned with ingestion [`canonical.py`](../../services/catalog-ingestion/catalog_ingestion/canonical.py)).
2. From repo root:

```bash
npm install
npm run showcase:demo-catalog    # refresh lib/demo-catalog.json
npm run dev -w @commerce-ai/showcase
```

3. Leave **`COMMERCE_GATEWAY_URL`** unset in `.env.local` — search runs **in-process** over the generated JSON.

On **Vercel**, `prebuild` runs the same generator; **no env vars** are required for the CSV path.

## Local (with real gateway)

```bash
# from repo root:
npm install
npm run dev -w @commerce-ai/showcase
```

Or **`pnpm`** from repo root: `pnpm install` then `pnpm --filter @commerce-ai/showcase dev`.

Defaults to **http://localhost:3100**. Copy **`apps/showcase/.env.example`** → **`apps/showcase/.env.local`**:

```
COMMERCE_GATEWAY_URL=http://localhost:3000
COMMERCE_API_KEY=pk_stub
SHOWCASE_DEMO_SEARCH=false   # only used when catalog.csv is empty and no gateway
```

## Vercel

1. Import GitHub repo.
2. **Root Directory**: **`apps/showcase`** (see **`vercel.json`**).
3. **Optional env** (only if you use the live gateway): **`COMMERCE_GATEWAY_URL`**, **`COMMERCE_API_KEY`**. When the gateway is unset and **`data/catalog.csv`** has rows, search uses the **CSV bundle** automatically.
4. Deploy.

Gateway must be **HTTPS** for production API mode.

Playbook: **[`DEPLOYMENT_SHOWCASE.md`](../../DEPLOYMENT_SHOWCASE.md)**.

## Self-host Node

```bash
npm install           # repo root
npm run build -w @commerce-ai/showcase
cd apps/showcase && PORT=8080 npm start
```

Optional `SHOWCASE_STANDALONE=true` before `npm run build -w @commerce-ai/showcase` for smaller Docker bundles (`output: "standalone"` in `next.config.mjs`).
