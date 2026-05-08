# Commerce AI — positioning & stack-agnostic integration

This guide is written for **customer architects**, **partners**, and **GTM stakeholders**. It explains what the platform does in business terms and **how customers adopt it without committing to any single frontend framework, cloud vendor, or legacy commerce engine**.

Technical depth: **[ARCHITECTURE.md](./ARCHITECTURE.md)** · API: **[contracts/openapi.yaml](../contracts/openapi.yaml)**.

---

## 1. What you’re buying (capabilities)

Delivered as capabilities, **not as a mandated storefront**:

| Capability | Customer outcome |
|------------|-------------------|
| **Hybrid product search** | Better conversion on long-tail (“red running shoes under 200”) plus exact SKU lookup |
| **Facets & commerce filters** | Colour, price bands, markets—aligned with how merchandisers trade |
| **Catalog-speed ingest** | Move from brittle batch feeds to **`csv.gz`** plus presigned uploads and observable jobs |
| **Agent-ready API** | Same corpus powers conversational shopping experiences without re-indexing churn |
| **Analytics intake** | Close the feedback loop—clicks, impressions, zeros—into learning/ranking roadmap |

Optional **showcase Next.js demo** illustrates UX patterns; production customers **consume the API** behind their chosen stack.

---

## 2. The stack-agnostic selling story

Most enterprises already have commitments: Adobe, Salesforce, Shopify, custom Java, .NET, or mobile native stacks. The wedge is:

> **Commerce AI attaches at the retrieval layer, not at the storefront template layer.**

Concrete promises you can defend in RFP conversations:

### 2.1 Contract-first HTTPS API

Customers integrate with **REST + JSON**, versioned via **OpenAPI 3**. Any language works as long as it speaks HTTP (`fetch`, OkHttp, `HttpClient`, `axios`, Retrofit, and so on). There is no mandated React version and no SPA requirement.

### 2.2 Side-by-side coexistence (“strangler”)

Patterns that fit **every** incumbent stack:

- **Composable headless storefront:** search box → `POST /v1/search` → render tiles.
- **Monolith SSR (Java, PHP, Razor):** a server-side module calls the Commerce AI API and renders HTML. No client bundle is required.
- **Mobile apps:** identical JSON contract; CDN edge caching stays your choice. No WebView hacks are required.
- **Marketplace integrations:** merchants keep master data in ERP or PIM; you accept periodic **`catalog.csv.gz`** drops.

### 2.3 Operational boundary clarity

Expose **only** the **API gateway** to the Internet. Postgres, Redis, and OpenSearch stay private. This fits VPC peering, private link patterns, and brownfield middleware teams.

### 2.4 Neutral object storage posture

Merchant feeds land in **S3-compatible** buckets (AWS S3, MinIO, GCS interoperability layers, Azure Blob via S3-compatible gateways). Warehouse choice is orthogonal to relevance quality.

---

## 3. Persona-based pitch tracks

### 3.1 CTO / VP Engineering

Standardize retrieval across brands without replatforming every storefront: an **OpenAPI boundary** and a **private data plane**. LLM and agent features reuse the same corpus—no duplicated product truth.

### 3.2 Search / relevance owner

Lexical-plus-semantic fusion hooks, facets, multilingual field modelling, and deterministic filters—benchmark in the customer environment before SLA promises land in contracts.

### 3.3 Security / IAM

Separate **credential authentication** from **merchant data paths**: **direct-to-object-storage upload** keeps multi-gigabyte files off the gateway and shrinks choke and leak surfaces. See [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md).

### 3.4 Merchandising / ecommerce lead

One CSV-derived source of truth powers site search, conversational flows, and partner APIs—fewer SKU reconciliation fires between channels.

---

## 4. Procurement-friendly packaging ideas

Pricing and licensing are business policy (not encoded in this repo). Architectures that resonate with procurement often look like:

| Package | Typical contents |
|---------|-------------------|
| **Core API** | `POST /v1/search` plus quotas plus SLA envelope |
| **Catalog bandwidth** | Ingest throughput and storage included |
| **Agent add-on** | `POST /v1/agent/query` plus safety filters |
| **Analytics add-on** | Event pipeline and dashboards (roadmap-aligned) |
| **White-glove mapping** | Help building CSV-to-canonical adapters for exotic PIMs |

---

## 5. Competitive differentiation framing (honest scaffold stage)

Sell **truthfully** relative to current maturity:

- **Differentiator:** an OpenAPI-visible **end-to-end pipeline** (gateway → orchestrator → ingest → OpenSearch) rather than slideware-only POCs.
- **Be explicit** about scaffold areas today: API key to tenant binding, published SLA latency numbers, and pretrained reranking. Point buyers to milestone lists in [TECHNICAL_PRD.md](../TECHNICAL_PRD.md).

Avoid quoting **latency SLAs** from engineering targets until benchmarks exist in labelled environments. **Do** promise deterministic integration seams: presign → import → poll job → search.

---

## 6. Land-and-expand motions

### Land (illustrative, order of operations)

1. Contract and network path: VPC connectivity or public gateway URL plus secrets.
2. Map a CSV subset onto the canonical schema and validate row quality.
3. Index a pilot tenant and wire an existing search UX or parallel A/B path.

### Expand

Add locales, synonym rules, embedding fusion, analytics-backed ranking, and omnichannel parity (reuse the same corpus for mobile, web, and in-store lookup).

---

## 7. RFP-ready integration checklist

| Question | Answer (platform stance) |
|----------|---------------------------|
| **Supported clients** | Any HTTPS client; optional generated SDKs from OpenAPI. |
| **Auth model** | `Authorization: Bearer` API keys today; mature posture is Postgres-backed keys bound to tenants. |
| **Large catalog uploads** | Presigned PUT avoids gateway body limits for multi-GB gzip files. |
| **Hosting** | Data plane runs on Docker, Kubernetes, VMs, or managed services. Gateway needs stable HTTPS. Showcase on Vercel is optional demo only. |
| **Compliance** | Customer classifies catalog content; platform supports TLS, private networking, and logging hooks. |

---

## 8. Collateral hierarchy

Order of technical documents to hand a customer architect:

1. This document (executive plus integration summary).
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [TECHNICAL_REQUIREMENTS.md](./TECHNICAL_REQUIREMENTS.md)
4. [contracts/openapi.yaml](../contracts/openapi.yaml) (machine-readable contract)
5. [DEPLOYMENT_SHOWCASE.md](../DEPLOYMENT_SHOWCASE.md) (operations runbook for the demo app and env vars)

---

## 9. Boilerplate elevator pitch (~30 seconds)

Commerce AI is a retrieval platform for product catalogs: deterministic REST search with hybrid lexical and semantic controls, gzip CSV ingest straight to object storage, and an agent API on the same index. Integrate from React, composable storefronts, SAP Hybris-style SSR, or Swift—anything that can call HTTPS. Customers keep checkout and PDP ownership; the platform owns relevance plumbing at scale.
