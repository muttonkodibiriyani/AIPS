# Retrieval stack — validation matrix (requested vs implemented)

This document maps the **production-style stack you described** to what exists **today** in this monorepo, and the **smallest next steps** to close gaps.

| Capability | Requested | Current state in repo | Notes |
|------------|-----------|------------------------|--------|
| **Sparse lexical / BM25** | Yes | **Yes (OpenSearch path)** | [`OpenSearchAdapter`](/services/search-orchestrator/commerce_ai_search/adapters/opensearch_adapter.py) uses `multi_match` with `sku^3` and text fields (OpenSearch default similarity is BM25). |
| **Exact SKU / model #** | Boosted lexical | **Partial** | SKU field boosted; no dedicated “identifier-only” query mode or catalog-specific normalisation yet. |
| **Dense vectors (embeddings)** | MiniLM / mpnet | **Not wired end-to-end** | Index template reserves `embedding` **knn_vector** @ **768 dims** ([template](/configs/opensearch/commerce-products-index-template.json)). **768** matches many **mpnet**-class models, **not** `all-MiniLM-L6-v2` (**384**). Choose one model and align **dimension** + reindex. |
| **Vector store: FAISS (local)** | Optional | **Not implemented** | Typical for **in-proc** demos; production usually uses a **managed** ANN (OpenSearch KNN, Qdrant, Pinecone). |
| **Qdrant / Pinecone** | Production | **Not implemented** | Adapter interface (`SearchEngineAdapter`) allows a second implementation; today only **OpenSearch**. |
| **OpenSearch KNN hybrid** | Recommended | **Schema only** | Template has `knn: true` + `embedding` mapping. Code **deletes `query_vector`** in `hybrid_search` today — **semantic branch inactive**. |
| **Hybrid fusion (lex + vector)** | Yes | **Roadmap** | Weights exist in API context; fusion logic after vectors land in orchestrator. Showcase uses **parallel lexical + LLM JSON cues** (different from ANN hybrid). |
| **CrossEncoder rerank (top 10–20)** | sentence-transformers | **Not implemented** | Add a **CPU/GPU rerank** step post-retrieval in `search-orchestrator` or gateway BFF; guard **latency budget** (PRD targets). |
| **LLM intent (query understanding)** | Yes | **Partial (showcase)** | Gemini + OpenRouter JSON intent; heuristic layer in [`query-intent-heuristics.ts`](/apps/showcase/lib/query-intent-heuristics.ts). **Not** the same as LangChain agent loop. |
| **LangChain orchestration** | Optional | **Not used** | You can wrap embedding + retrieve + rerank in LangChain/LCEL **without** replacing OpenAPI gateway. |
| **Analytics: queries + clicks + latency** | Yes | **Partial** | Showcase now emits **search + click** events via [`/api/analytics/search-event`](/apps/showcase/app/api/analytics/search-event/route.ts) and [`product-click`](/apps/showcase/app/api/analytics/product-click/route.ts) with **stdout / webhook** sink. Forward to your warehouse (BigQuery, ClickHouse, PostHog, gateway [`/v1/analytics/events`](/contracts/openapi.yaml)). |
| **Regression eval (track improvements)** | Yes | **Added** | Golden suite: [`eval/golden-queries.json`](/apps/showcase/eval/golden-queries.json) + `npm run eval:golden` + Vitest `golden-eval.test.ts`. |

## Recommended production path (concise)

1. **Pick embedding model** and set **index dimension** to match (or use **padding** / separate field — not ideal). Reindex with `embedding-worker` once batch job exists.  
2. **Enable OpenSearch KNN query** in `OpenSearchAdapter.hybrid_search` using `query_vector` + `knn` clause + score fusion (lexical + knn).  
3. **Add CrossEncoder rerank** on top **N** hits inside `search-orchestrator` behind a feature flag.  
4. **Stream analytics** to your SIEM/warehouse; correlate **query → click position → CTR** by intent segment.  
5. **Optional**: Qdrant/Pinecone if you want **vector store** outside OpenSearch — keep **one** source of truth for merchandising or accept dual-write complexity.

## Related docs

- [SEARCH_QUALITY_RUBRIC.md](./SEARCH_QUALITY_RUBRIC.md) — honest scoring / benchmarks.  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — runtime diagram.  
- [eval/README.md](../apps/showcase/eval/README.md) — golden tests.
