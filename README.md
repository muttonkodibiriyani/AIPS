# Commerce AI

Multi-tenant **hybrid commerce search** (lexical + vector), **agent API**, and **drop-in SDKs** — monorepo scaffold (Milestone 0).

**Repository:** [github.com/muttonkodibiriyani/AIPS](https://github.com/muttonkodibiriyani/AIPS) · **Ship UI + Vercel:** [DEPLOYMENT_SHOWCASE.md](./DEPLOYMENT_SHOWCASE.md)

**Documentation set:** [docs/README.md](./docs/README.md) — solution architecture, security architecture, technical requirements (TRD), and commercial / stack-agnostic integration positioning.

See [TECHNICAL_PRD.md](./TECHNICAL_PRD.md) for product scope, milestones, API ownership, and **Milestone 1 acceptance criteria**.

## Layout

| Path | Role |
|------|------|
| `apps/showcase` | **Leadership-ready Next.js demo** (NL search, Vercel / self-host — see [`apps/showcase/README.md`](./apps/showcase/README.md)) |
| `apps/admin-web` | Merchant console (stub; Milestone 2+) |
| `apps/storefront-demo` | Demo storefront (Milestone 1 hooks search API) |
| `packages/shared-types` | OpenAPI-generated TypeScript types (run `pnpm types:generate`) |
| `packages/sdk-*` | Client SDK stubs |
| `services/api-gateway` | NestJS: auth stub, tenant resolution, proxy to FastAPI |
| `services/search-orchestrator` | FastAPI: hybrid search, `SearchEngineAdapter` |
| `services/catalog-ingestion` | FastAPI: feeds → jobs |
| `services/*-worker`, `agent-service`, `analytics-service` | Workers & sidecars |
| `contracts/openapi.yaml` | Public API contract (OpenAPI 3.1) |
| `configs/opensearch` | Index templates |
| `infra/docker` | Local OpenSearch, Postgres, Redis, MinIO |

## Prerequisites

- Node 20+. **JS install:** `pnpm install` at repo root (full tree: [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) includes `packages/sdk-*` stubs). **`npm install`** (as on Vercel) uses [`package.json`](./package.json) `workspaces` which **omit** `packages/sdk-js` and `packages/sdk-react` so **`npm` never hits `workspace:*` / stub-only packages** while the showcase still builds. [.npmrc](./.npmrc) relaxes peer deps for `npm`.
- Python 3.11+ (recommended: [`uv`](https://github.com/astral-sh/uv))
- Docker (for `infra/docker/docker-compose.yml`)

## Quick start (local)

1. Copy environment template: `.env.example` → `.env` (adjust ports if needed).

2. Start data plane:

   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d
   ```

3. Install JS deps and generate types:

   ```bash
   pnpm install
   pnpm types:generate
   ```

4. Run Python services (each in its own terminal, from repo root):

   ```bash
   cd services/search-orchestrator && uv sync && uv run uvicorn commerce_ai_search.main:app --reload --port 8001
   ```

   Repeat for ports `8002`–`8006` per service README in `services/*/README.md`.

5. Run NestJS gateway:

   ```bash
   pnpm gateway:dev
   ```

6. Leadership UI (natural-language search playground):

   ```bash
   pnpm showcase:dev
   ```

   Set `COMMERCE_GATEWAY_URL` + `COMMERCE_API_KEY` in `apps/showcase/.env.local`. Deploy guide: [`DEPLOYMENT_SHOWCASE.md`](./DEPLOYMENT_SHOWCASE.md).

Gateway defaults to proxying `/v1/search` → search-orchestrator, etc. Use header `Authorization: Bearer <api_key>` (stub validates format only).

## OpenAPI contract

Canonical spec: [`contracts/openapi.yaml`](./contracts/openapi.yaml). Regenerate TS types:

```bash
pnpm types:generate
```

## License

Proprietary — internal scaffold.
