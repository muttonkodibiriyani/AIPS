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

**Root directory (pick one)**

| Root Directory | Config used |
|----------------|-------------|
| **`apps/showcase`** (recommended) | Next.js presets + [`apps/showcase/vercel.json`](./apps/showcase/vercel.json) (`install` / `build` jump to the monorepo root via `cd ../..`). |
| **`.`** (repository root) | Repo root [`vercel.json`](./vercel.json): **`npm install`** (workspaces in root [`package.json`](./package.json)) → **`npm run build -w @commerce-ai/showcase`** → output **`apps/showcase/.next`**. |

If Root Directory is **`.`** but **Project → Settings → Build & Development** overrides **Install** / **Build**, Vercel can ignore [`vercel.json`](./vercel.json) and fall back to **`npm run build`** at the root (full Turbo) or a broken **`pnpm install`**. Clear those overrides so the config above applies.

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import **muttonkodibiriyani/AIPS**.
2. **Root Directory:** **`apps/showcase`** **or** **`.`** per the table above.
3. **Environment variables** (Production + Preview):

   | Name | Purpose |
   |------|--------|
   | `COMMERCE_GATEWAY_URL` | Public HTTPS base URL of Nest gateway (must be reachable by Vercel’s build/runtime, e.g. `https://api.yourdomain.com`) |
   | `COMMERCE_API_KEY` | Same bearer key configured on the gateway (stub default often `pk_stub` in local `.env`). |

4. **Node.js version:** Keep **Node 20.x** for the build (see [`engines`](./package.json)). Vercel documents version selection in [Node.js Version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

5. Deploy. Subsequent pushes to the connected branch redeploy automatically.

Install on Vercel uses **`npm`** + **workspaces** (not `pnpm`) because `pnpm` registry fetches intermittently fail on Vercel with **`ERR_INVALID_THIS`** / **`URLSearchParams`**. Local development can still use **`pnpm`** (`pnpm-workspace.yaml` is unchanged).

[`apps/showcase/vercel.json`](./apps/showcase/vercel.json) applies when the Vercel **Root Directory** is `apps/showcase`. The repo root [`vercel.json`](./vercel.json) applies when the root directory is **`.`**.

Optional: commit **`package-lock.json`** (`npm install` at the repo root) for faster, reproducible Vercel installs. If you mostly use **pnpm** locally, also commit **`pnpm-lock.yaml`** after `pnpm install` so Turborepo and `pnpm` workflows stay deterministic.

---

## 3. Alternative: GitHub Action deploy

Requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Run **Deploy showcase to Vercel** manually from **Actions → workflow_dispatch**.

---

## 4. Backend + data plane (required for live search)

1. Bring up dependencies: **`docker compose -f infra/docker/docker-compose.yml up -d`** (OpenSearch, Postgres, Redis, MinIO).

2. Apply OpenSearch templates as in [`configs/opensearch/README.md`](./configs/opensearch/README.md).

3. Run **`services/search-orchestrator`**, **`services/catalog-ingestion`** (embedded worker or `commerce-ingest-worker`), **`services/api-gateway`**, aligned with `.env`/`.env.example` service URLs.

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

The showcase site calls the gateway via server route [`apps/showcase/app/api/search/route.ts`](./apps/showcase/app/api/search/route.ts); use the same `tenantId` in the UI if the demo exposes it.

More detail: [`services/catalog-ingestion/README.md`](./services/catalog-ingestion/README.md).

---

## 6. Self-host the Next.js showcase

```bash
pnpm install
pnpm --filter @commerce-ai/showcase build
pnpm --filter @commerce-ai/showcase start
```

Set `COMMERCE_GATEWAY_URL` and `COMMERCE_API_KEY` in the process environment. See [`apps/showcase/README.md`](./apps/showcase/README.md).

---

## Troubleshooting: `package.json … Expected double-quoted property name`

1. Open the failing build log and find the **`Commit:`** line. It must match the latest **`main`** on GitHub (see [Commits](https://github.com/muttonkodibiriyani/AIPS/commits/main)).
2. If the commit is older (for example **`e6585f0`**), Vercel is redeploying a stale revision. Fix: **Project → Deployments →** open the newest deployment produced by a **push** to **`main`**, or **Redeploy** from the dashboard after selecting **the latest Git commit**. Do **not** only “Redo” an old deployment.
3. In **Project Settings → Git**, confirm the repo is **`muttonkodibiriyani/AIPS`**, production branch **`main`**, and **Root Directory** **`apps/showcase`** (or **`./`** if you use root [`vercel.json`](./vercel.json)).
4. Log shows **`Running "npm run build"`** → **`next: command not found`**: you are building from the repo root with **npm** + full Turbo instead of **`pnpm`** + showcase only. Use root [`vercel.json`](./vercel.json) and clear dashboard build overrides, **or** set Root Directory to **`apps/showcase`**.
5. **`pnpm install` fails** with **`ERR_INVALID_THIS`**, **`ERR_PNPM_META_FETCH_FAIL`**, or **`Value of "this" must be of type URLSearchParams`**: Vercel installs in this repo use **`npm install`** (see root [`vercel.json`](./vercel.json)) specifically to avoid **`pnpm`** registry bugs on Vercel builds. If your project still runs **`pnpm install`**, clear dashboard **Install Command** overrides so [`vercel.json`](./vercel.json) applies (see also [Node.js Version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) and **Node 20.x** via `engines`).

[GitHub `main`/package.json](https://github.com/muttonkodibiriyani/AIPS/blob/main/package.json) must parse as strict JSON (no trailing commas).

---

## CI

Showcase build: [`.github/workflows/showcase-ci.yml`](.github/workflows/showcase-ci.yml).
