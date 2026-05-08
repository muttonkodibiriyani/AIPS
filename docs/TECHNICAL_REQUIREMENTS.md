# Commerce AI — technical requirements document (TRD)

**Document type:** Requirements specification (functional + non-functional), aligned to repository artifacts.  
**Product detail & milestones:** [TECHNICAL_PRD.md](../TECHNICAL_PRD.md).  
**API contract:** [contracts/openapi.yaml](../contracts/openapi.yaml).

**Convention:** **`SHALL`** = mandatory for “done” MVP in target environment; **`SHOULD`** = recommended / phase 2; **`MAY`** = optional.

---

## 1. Scope & stakeholders

### 1.1 In scope

- Hybrid commerce product **search**, **facet** scaffolding, catalog **ingestion** from **gzip CSV**, analytics **event** intake, conversational **agent** API surface (per OpenAPI).
- **Multi-tenant** logical isolation at the retrieval layer (`tenant_id` on documents and enforced in queries).

### 1.2 Explicitly bounded

- Hosted checkout / payments (integrate with PSPs separately).
- Long-running model training pipelines (beyond embedding generation)—see roadmap in PRD.
- Native mobile SDKs shipping in this repo (contract allows any HTTP client).

### 1.3 Stakeholders

| Role | Need |
|------|------|
| **Merchant tech** | REST integration, deterministic schema, SLA clarity |
| **Search relevance** | Tunable lexical/semantic mix, synonyms/boosts roadmap |
| **Security / platform** | API keys, tenancy, auditability |
| **Operations** | Health checks, ingest job visibility, reproducible infra |

---

## 2. System context

Refer to **[ARCHITECTURE.md](./ARCHITECTURE.md)**. Externally visible interface **SHALL** be the **`api-gateway`** HTTPS JSON API as specified in OpenAPI, unless deploying **showcase-only** demo mode (`POST /api/search` offline path).

---

## 3. Functional requirements

### 3.1 Search

| ID | Requirement |
|----|-------------|
| **FR-S-01** | The system **SHALL** expose `POST /v1/search` accepting `tenantId`, `query`, and optional contextual filters compatible with [`SearchRequest`](../contracts/openapi.yaml). |
| **FR-S-02** | Responses **SHALL** return ranked hits and facet scaffolding as per `SearchResponse`. |
| **FR-S-03** | When `query` is empty where supported, behavior **SHALL** be deterministic (e.g., match/browse mode per orchestrator)—see Milestone acceptance in PRD. |
| **FR-S-04** | Filters for **price** and **facet** constraints **SHALL** integrate with canonical nested `pricing`/attrs mappings (implemented in orchestrator scaffolding). |

### 3.2 Autocomplete

| ID | Requirement |
|----|-------------|
| **FR-A-01** | The system **SHALL** expose `GET /v1/autocomplete` with `q`, optional `tenantId`, `locale` per OpenAPI. |
| **FR-A-02** | Completeness MAY improve over milestones (stub latency targets in PRD). |

### 3.3 Ingest & indexing

| ID | Requirement |
|----|-------------|
| **FR-I-01** | The system **SHALL** expose `POST /v1/admin/feeds/presign` returning a client-direct **PUT URL** + object key metadata. |
| **FR-I-02** | The system **SHALL** expose `POST /v1/admin/feeds/import` to enqueue processing of **`*.csv.gz`** already stored in object storage. |
| **FR-I-03** | The system **SHALL** expose `GET /v1/admin/feeds/jobs/{jobId}` (per OpenAPI) for job lifecycle visibility. |
| **FR-I-04** | Ingestion **SHALL** map CSV rows to **canonical documents** aligned with ingestion service (`canonical.py` reference). |
| **FR-I-05** | Bulk indexing **SHALL** batch documents into OpenSearch (configurable batch size/env). |

### 3.4 Agent API

| ID | Requirement |
|----|-------------|
| **FR-G-01** | The system **SHALL** expose `POST /v1/agent/query` per [`AgentQueryRequest` / `AgentQueryResponse`](../contracts/openapi.yaml). |
| **FR-G-02** | Grounded answers **SHALL** converge on same retrieval primitives as search (architecture goal—incremental rollout per PRD milestones). |

### 3.5 Analytics

| ID | Requirement |
|----|-------------|
| **FR-N-01** | The system **SHALL** accept behavioural batches via `POST /v1/analytics/events`. |

### 3.6 Health & operability

| ID | Requirement |
|----|-------------|
| **FR-O-01** | The gateway **SHALL** expose `GET /health` for liveness-style checks (see OpenAPI). |
| **FR-O-02** | Upstream FastAPI services **SHOULD** expose health endpoints usable behind the gateway (`/health` patterns—per service conventions). |

### 3.7 Showcase app (demo)

These apply when deploying [`apps/showcase`](../apps/showcase/):

| ID | Requirement |
|----|-------------|
| **FR-D-01** | The showcase **MAY** run without the gateway using an embedded JSON demo catalog derived from CSV at build time and **SHALL NOT** silently present production-classification data without clear labeling. |
| **FR-D-02** | The showcase **SHALL** optionally proxy `/api/search` to gateway when configured—see [DEPLOYMENT_SHOWCASE.md](../DEPLOYMENT_SHOWCASE.md). |
| **FR-D-03** | LLM intent augmentation **SHALL** be configurable via environment flags and **SHALL NOT** expose API keys client-side. |

---

## 4. Non-functional requirements

### 4.1 Performance (engineering targets)

From [TECHNICAL_PRD.md](../TECHNICAL_PRD.md)—**goals**, not SLA until benchmarked:

| ID | Requirement |
|----|-------------|
| **NFR-P-01** | Autocomplete **SHOULD** hit p95 80–150 ms (post-completion indexing model). |
| **NFR-P-02** | Search **SHOULD** hit p95 150–400 ms typical SKU corpora sizes (environment-dependent). |
| **NFR-P-03** | Agent grounding **SHOULD** hit p95 700–1800 ms bounded by LLM + retrieval. |

### 4.2 Reliability & scalability

| ID | Requirement |
|----|-------------|
| **NFR-R-01** | Search path **SHALL** degrade gracefully—gateway returns actionable errors upstream (502/503 patterns) rather than partial HTML. |
| **NFR-R-02** | Ingest **SHALL** tolerate worker restarts by persisting **`index_jobs`** in Postgres when enabled. |

### 4.3 Security

Cross-reference **[SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)**.

| ID | Requirement |
|----|-------------|
| **NFR-SEC-01** | External API endpoints (except deliberate dev bypass) **SHALL** require `Authorization` per gateway guard semantics. |
| **NFR-SEC-02** | Production deployments **SHALL NOT** expose admin OpenSearch dashboards or MinIO consoles to untrusted networks. |
| **NFR-SEC-03** | Tenant isolation **SHALL** be enforced server-side beyond document-level indexing—see SECURITY doc for roadmap on key→tenant binding. |

### 4.4 Observability

| ID | Requirement |
|----|-------------|
| **NFR-O-01** | Services **SHOULD** attach `request_id` / correlation propagation through gateway proxies (recommended enhancement). |

### 4.5 Maintainability / integration

| ID | Requirement |
|----|-------------|
| **NFR-M-01** | Public API evolution **SHALL** be tracked in **OpenAPI 3.x** semver policy (additive backward compatible changes preferred). |

---

## 5. Interfaces & interoperability

### 5.1 REST / JSON contract

Canonical: [`contracts/openapi.yaml`](../contracts/openapi.yaml).  
Clients **SHALL** target this contract; TypeScript typings **SHOULD** be regenerated using `pnpm types:generate`.

### 5.2 Data formats

- **Catalog ingest:** **`application/gzip`** CSV (`.csv.gz`), UTF‑8, headers aligned with [`canonical.py`](../services/catalog-ingestion/catalog_ingestion/canonical.py).
- **Search:** JSON MIME types per OpenAPI.

---

## 6. Constraints & assumptions

### 6.1 Environment

| Constraint | Detail |
|------------|--------|
| **Node runtime (showcase / gateway JS)** | LTS parity per root `engines`; Vercel may pin Node independently—see DEPLOYMENT doc. |
| **Python runtime** | 3.11+ typical for FastAPI workers; use `uv` per README. |

### 6.2 External dependencies

- **OpenSearch 2.x** for default adapter (`configs/opensearch`).
- **S3-compatible** object storage compatible with AWS SigV4-style presigned PUT (MinIO locally).

---

## 7. Acceptance & traceability matrix (summary)

| Requirement cluster | Acceptance evidence |
|--------------------|---------------------|
| Search/OpenAPI parity | Passing API tests / manual curl playbook in PRD + gateway proxy smoke |
| Ingest CSV.gz | Scripted flow §5–6 in DEPLOYMENT_SHOWCASE |
| Showcase deploy | Successful `next build` + `/api/health` shape |
| Security posture | SECURITY_ARCHITECTURE checklist + remediation of stub tenant binding before prod multi-tenant |

---

## 8. Glossary

- **Hybrid search**: combining lexical retrieval (exactness / token match) with vector or semantic retrieval.
- **Canonical document**: unified JSON shape stored in OpenSearch for a SKU/variation aggregate.
- **Gateway**: NestJS façade implementing edge auth & proxy routing.
