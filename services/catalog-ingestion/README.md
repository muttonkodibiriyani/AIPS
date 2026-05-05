## Enterprise CSV ingest (gzip)

**Flow**: `presign → PUT (MinIO) → import → worker streams csv.gz → OpenSearch bulk**.

### Required services

Docker: Postgres, Redis, MinIO, OpenSearch (see [`../../infra/docker/docker-compose.yml`](../../infra/docker/docker-compose.yml)). Apply [`../../configs/opensearch/README.md`](../../configs/opensearch/README.md) index template + alias.

### Run API + embedded worker

```bash
cd services/catalog-ingestion
uv sync
uv run uvicorn catalog_ingestion.main:app --reload --port 8002
```

The FastAPI process starts a **background thread** that consumes `ingest:queue` on Redis unless `EMBEDDED_INGEST_WORKER=false` (then run `uv run commerce-ingest-worker` separately).

### Large file upload (1GB+)

Use **presigned PUT** or `curl` (recommended for huge files). After upload, call `POST /v1/admin/feeds/import` with `objectKey`.

### Column mapping

Default aliases cover bilingual `Name` / `Long Description`, `SKU (Part Number)`, `price.ae` / `price.sa`, `Image Links`, `Composition`, etc. See [`catalog_ingestion/canonical.py`](catalog_ingestion/canonical.py).

### MinIO CORS

Browser PUT from the demo app requires CORS on the bucket. Configure with `mc cors set` or upload via **curl** from the URL returned by `POST /v1/admin/feeds/presign`.
