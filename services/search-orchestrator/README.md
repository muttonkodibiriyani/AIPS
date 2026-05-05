# search-orchestrator

FastAPI service on port **8001**. Owns `POST /v1/search`, `GET /v1/autocomplete`, health, and the **`SearchEngineAdapter`** / **`OpenSearchAdapter`** implementation.

## Run

```bash
cd services/search-orchestrator
uv sync
uv run uvicorn commerce_ai_search.main:app --reload --port 8001
```

Set `OPENSEARCH_URL` and `PRODUCTS_INDEX_ALIAS` (defaults in [`commerce_ai_common`](../shared-python/commerce_ai_common/settings.py)).

## Behaviour (Milestone 0)

- If OpenSearch does not ping, returns a stub product explaining ingestion is pending.
- Lexical retrieval uses BM25 `multi_match` on `search_text.*`, `sku`, `title.*`; filters: `tenant_id`, optional `market`, `color`, `availability`.
