# Showcase · leadership-ready Next.js frontend

Executive narrative + live **natural-language search** wired to Nest via **`POST /api/search`** so `COMMERCE_API_KEY` stays server-side.

## Local

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
SHOWCASE_DEMO_SEARCH=false   # true = sample SKUs in /api/search when gateway URL omitted
```

## Vercel

1. Import GitHub repo.
2. **Root Directory**: **`apps/showcase`** (required — see **`vercel.json`** in this folder).
3. Env: **`COMMERCE_GATEWAY_URL`**, **`COMMERCE_API_KEY`**. Optionally **`SHOWCASE_DEMO_SEARCH=true`** for UI rehearsal without a gateway (sample products only).
4. Deploy.

Gateway must be **HTTPS** when used in production previews.

Repo + ingest + SLT playbook: **[`DEPLOYMENT_SHOWCASE.md`](../../DEPLOYMENT_SHOWCASE.md)** (root).

## Self-host Node

```bash
npm install           # repo root
npm run build -w @commerce-ai/showcase
cd apps/showcase && PORT=8080 npm start
```

Optional `SHOWCASE_STANDALONE=true` before `npm run build -w @commerce-ai/showcase` for smaller Docker bundles (`output: "standalone"` in `next.config.mjs`).
