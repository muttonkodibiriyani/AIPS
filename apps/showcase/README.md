# Showcase · leadership-ready Next.js frontend

Executive narrative + live **natural-language search** wired to Nest via **`POST /api/search`** so `COMMERCE_API_KEY` stays server-side.

## Local

```bash
pnpm install        # repo root
pnpm --filter @commerce-ai/showcase dev
```

Defaults to http://localhost:3100. Create **`apps/showcase/.env.local`** (gitignored by Next conventions):

```
COMMERCE_GATEWAY_URL=http://localhost:3000
COMMERCE_API_KEY=pk_stub
```

## Vercel

1. Import GitHub repo in Vercel.
2. **Root Directory**: `apps/showcase`
3. Env: `COMMERCE_GATEWAY_URL`, `COMMERCE_API_KEY`
4. Deploy.

Gateway must be HTTPS and reachable from Vercel edge servers for the demo URL.

Repo + push + ingest + SLT playbook: **[`DEPLOYMENT_SHOWCASE.md`](../../DEPLOYMENT_SHOWCASE.md)** (root).

## Self-host Node

```
cd apps/showcase && pnpm install && pnpm build && PORT=8080 pnpm start
```

Optional `SHOWCASE_STANDALONE=true` before `pnpm build` for smaller Docker bundles (`output: "standalone"` in `next.config.mjs`).