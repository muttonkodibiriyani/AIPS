NestJS gateway: proxies public routes to FastAPI backends. Loads `.env` from repo root when present (`../../../.env` from `services/api-gateway` cwd).

## Routes

| Path | Upstream env |
|------|----------------|
| `POST /v1/search` | `SEARCH_ORCHESTRATOR_URL` |
| `GET /v1/autocomplete` | `SEARCH_ORCHESTRATOR_URL` |
| `POST /v1/agent/query` | `AGENT_SERVICE_URL` |
| `POST /v1/analytics/events` | `ANALYTICS_SERVICE_URL` |
| `POST /v1/admin/feeds/import` | `CATALOG_INGESTION_URL` |
| `POST /v1/internal/jobs/reindex` | `CATALOG_INGESTION_URL` |
