# Showcase deployment · GitHub, Vercel, self‑host, catalog upload

Upstream repo: **[muttonkodibiriyani/AIPS](https://github.com/muttonkodibiriyani/AIPS)**  

**Architecture note:** [`apps/showcase`](./apps/showcase) is **only** the Next.js UI. Search and ingestion (`services/*`, OpenSearch, MinIO, Postgres, Redis) run **outside Vercel** (Docker Compose, Railway, ECS, VM, …). Point `COMMERCE_GATEWAY_URL` at whatever hosts the Nest gateway over **HTTPS**.

---

## 1. Push this monorepo to GitHub

If the folder is not a repo yet:

```bash
git init
git add .
git commit -m "feat: commerce AI monorepo, showcase + ingestion pipeline"
git branch -M main
git remote add origin https://github.com/muttonkodibiriyani/AIPS.git
git push -u origin main
```

If GitHub already has a `LICENSE` commit, pull with allow-unrelated histories or reset remote content per GitHub docs, then push.

---

## 2. Deploy showcase on Vercel (recommended auto-deploy)

The simplest path **does not use** the optional GitHub Action in [`.github/workflows/deploy-showcase-vercel.yml`](.github/workflows/deploy-showcase-vercel.yml).

**Critical — Vercel Root Directory**

Set **Project → Settings → General → Root Directory** to **`apps/showcase`** (not the repository root).  
The Next.js app and [`apps/showcase/vercel.json`](./apps/showcase/vercel.json) live there. Deploying with Root Directory **`.`** and a repo-root `vercel.json` is **not supported** for this monorepo: Vercel’s Next.js integration expects `next.config` and the app beside the computed `.next` output ([configure a build / root directory](https://vercel.com/docs/builds/configure-a-build)).

[`apps/showcase/vercel.json`](./apps/showcase/vercel.json) runs **`cd ../.. && npm install`** (npm workspaces from the repo root), then **`npm run build`** (Next in this app).

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import **muttonkodibiriyani/AIPS**.
2. **Root Directory:** **`apps/showcase`** (your screenshot matches this). Optionally set **Framework Preset** to **Next.js**; **Other** is fine because [`apps/showcase/vercel.json`](./apps/showcase/vercel.json) includes `"framework": "nextjs"` so the CLI build stays correct when the dashboard preset is **Other**.
3. **Environment variables:** open **Project → Settings → Environment Variables** (scroll past Build & Development). Until `COMMERCE_GATEWAY_URL` is set **or** `SHOWCASE_DEMO_SEARCH=true`, the site shows a yellow **configuration banner** and search returns **`503`** (no demo).

   **Minimal rows to add (recommended for SLT rehearsal before the gateway exists):**

   | Key | Value | Apply to |
   |-----|--------|----------|
   | `SHOWCASE_DEMO_SEARCH` | `true` | Production · Preview · Development |

   Click **Save** for each row, then **Deployments → … → Redeploy** — **environment variables apply only after a redeploy.**

   **When the Nest gateway is on HTTPS:**

   | Key | Example value | Notes |
   |-----|----------------|------|
   | `COMMERCE_GATEWAY_URL` | `https://your-api.example.com` | No trailing slash. Must be reachable from Vercel servers. |
   | `COMMERCE_API_KEY` | `pk_stub` | Match the gateway’s API key checker. Same value for ingest/Swagger curl. |
   | `SHOWCASE_DEMO_SEARCH` | `false` or delete | Disables fake SKUs; `/api/search` proxies to **`/v1/search`**. |

4. **Node.js:** **20.x** (see [`engines`](./package.json) and [Node.js Version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).

5. Keep **Install** / **Build** overrides **OFF** under **Build & Development** so **`cd ../.. && npm install`** and **`npm run build`** from [`vercel.json`](./apps/showcase/vercel.json) apply.

6. Deploy. Subsequent pushes redeploy automatically.

Validate from the deployed URL:

- **`GET /api/health`** — `{ "gatewayConfigured", "demoSearchEnabled", "liveSearchAvailable" }` (never returns secrets).


Install uses **`npm`** + **workspace** installs from repo root (**`pnpm`** hits **`ERR_INVALID_THIS`** on many Vercel builders). Root [`package.json`](./package.json) does **not** set **`packageManager`**, so **`npm`** is the default unless you override Install in the dashboard. Local **`pnpm`** is still supported via [`pnpm-workspace.yaml`](./pnpm-workspace.yaml).

Optional: commit **`package-lock.json`** after `npm install` at repo root for faster, reproducible installs. For local **pnpm**, commit **`pnpm-lock.yaml`** when your team pins `pnpm`.

---

## 3. Alternative: GitHub Action deploy

Requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Run **Deploy showcase to Vercel** manually from **Actions → workflow_dispatch**. The workflow uses **`working-directory: apps/showcase`** and matches the dashboard Root Directory rule above.

---

## 4. Backend + data plane (required for live search)

1. Bring up dependencies: **`docker compose -f infra/docker/docker-compose.yml up -d`** (OpenSearch, Postgres, Redis, MinIO).

2. Apply OpenSearch templates as in [`configs/opensearch/README.md`](./configs/opensearch/README.md).

3. Run **`services/search-orchestrator`**, **`services/catalog-ingestion`** (embedded worker or ingest worker), **`services/api-gateway`**, aligned with `.env`/`.env.example` service URLs.

4. Expose the **gateway** on **HTTPS** (reverse proxy / tunnel / managed host).

---

## 5. Upload catalog data (SLT-ready flow)

Compress your catalog CSV as **gzip** (`.csv.gz`). Use the same **`tenantId`** everywhere (ingest + search).

**1 Presign**

```bash
curl -sS -X POST "$GATEWAY/v1/admin/feeds/presign" \
  -H "Authorization: Bearer $COMMERCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"demo-sl","filename":"catalog.csv.gz"}'
```

Take `uploadUrl` and `objectKey` from JSON.

**2 Upload file**

```bash
curl -X PUT "$(jq -r .uploadUrl upload.json)" -H "Content-Type: application/gzip" --data-binary @"./catalog.csv.gz"
```

(or use HTTPie / Postman.)

**3 Enqueue ingest**

```bash
curl -sS -X POST "$GATEWAY/v1/admin/feeds/import" \
  -H "Authorization: Bearer $COMMERCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"tenantId\":\"demo-sl\",\"objectKey\":\"OBJECT_KEY_FROM_PRESIGN\"}"
```

Poll **`GET /v1/admin/feeds/jobs/{jobId}`** until `status` is `completed`.

**4 Search** (same tenant)

```bash
curl -sS -X POST "$GATEWAY/v1/search" \
  -H "Authorization: Bearer $COMMERCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"demo-sl","query":"red shoes under 200"}'
```

The showcase UI uses **`POST /api/search`** → gateway; tenant defaults include **`demo-sl`** in the NL playground ([`apps/showcase/components/nl-search-demo.tsx`](./apps/showcase/components/nl-search-demo.tsx)).

More detail: [`services/catalog-ingestion/README.md`](./services/catalog-ingestion/README.md).

---

## 6. Self-host the Next.js showcase

```bash
npm install    # repo root — workspaces
cd apps/showcase && npm run dev
```

Or `pnpm install` locally if you prefer. Set `COMMERCE_GATEWAY_URL` and `COMMERCE_API_KEY` in `apps/showcase/.env.local`. See [`apps/showcase/README.md`](./apps/showcase/README.md).

---

## Troubleshooting: `package.json … Expected double-quoted property name`

1. Confirm the **`Commit:`** in the failing log matches **latest [`main`](https://github.com/muttonkodibiriyani/AIPS/commits/main)**.
2. If the SHA is stale, redeploy **from `main`** (don’t redo an old deployment only).

---

## Troubleshooting: **`pnpm install`**, **`next: command not found`**, **`ERR_INVALID_THIS`**

1. **Root Directory** MUST be **`apps/showcase`**.
2. Do **not** force **`pnpm`** in the dashboard when this repo configures **`npm`** from [`apps/showcase/vercel.json`](./apps/showcase/vercel.json).
3. **`pnpm install`** errors with **`ERR_INVALID_THIS`** / **`URLSearchParams`**: stick to **npm** on Vercel (as configured); use **Node 20.x**.
4. Log shows **`next: command not found`**: monorepo install did not finish or Root Directory pointed at `.` — fix Root Directory + clear Install overrides.

---

## CI

Showcase build: [`.github/workflows/showcase-ci.yml`](.github/workflows/showcase-ci.yml).
