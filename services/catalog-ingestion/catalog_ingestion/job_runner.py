from __future__ import annotations

import csv
import gzip
import logging
from io import TextIOWrapper
from typing import Any
from uuid import UUID

from commerce_ai_common import CommonSettings

from catalog_ingestion.canonical import alias_row, row_to_opensearch_doc
from catalog_ingestion.db import IndexJobRow, session_scope, utcnow
from catalog_ingestion.minio_ops import get_object_stream
from catalog_ingestion.opensearch_bulk import bulk_upsert, make_os_client

log = logging.getLogger(__name__)


def process_index_job(job_id: UUID, settings: CommonSettings, SessionLocal) -> None:
    os_client = make_os_client(settings)
    if not os_client.ping():
        raise RuntimeError("OpenSearch unreachable — start docker compose OpenSearch.")

    batch_size = settings.ingest_batch_size

    tenant_id: str
    object_key: str
    default_market: str

    with session_scope(SessionLocal) as sess:
        job = sess.get(IndexJobRow, job_id)
        if job is None:
            log.warning("Job %s not found", job_id)
            return
        if job.status not in {"queued", "processing"}:
            return

        tenant_id = job.tenant_id
        object_key = job.object_key
        meta = dict(job.meta_json or {})
        default_market = str(meta.get("defaultMarket") or meta.get("default_market") or "AE")

        job.status = "processing"
        job.updated_at = utcnow()
        sess.add(job)

    rows_processed = 0
    rows_indexed = 0
    response = None
    try:
        response = get_object_stream(settings, object_key)
        gz_stream = gzip.GzipFile(fileobj=response, mode="rb")
        text_io = TextIOWrapper(gz_stream, encoding="utf-8-sig", newline="", errors="replace")
        reader = csv.DictReader(text_io)

        if reader.fieldnames is None:
            raise RuntimeError("CSV has no header row")

        log.info(
            "Job %s stream tenant=%s key=%s sample_headers=%s",
            job_id,
            tenant_id,
            object_key,
            list(reader.fieldnames)[:14],
        )

        batch: list[dict[str, Any]] = []

        def flush_checkpoint() -> None:
            nonlocal rows_indexed
            with session_scope(SessionLocal) as s2:
                j2 = s2.get(IndexJobRow, job_id)
                if j2:
                    j2.rows_processed = rows_processed
                    j2.rows_indexed = rows_indexed
                    j2.updated_at = utcnow()
                    s2.add(j2)

        for raw in reader:
            rows_processed += 1
            cleaned = {
                str(k): (raw[k] if raw.get(k) is not None else "")
                for k in (reader.fieldnames or [])
                if k is not None
            }
            normalized = alias_row({kk: vv or None for kk, vv in cleaned.items()})

            doc = row_to_opensearch_doc(tenant_id, normalized, default_market)
            if doc is None:
                continue
            batch.append(doc)
            if len(batch) >= batch_size:
                n, errs = bulk_upsert(os_client, settings.products_index_alias, batch)
                rows_indexed += n
                if errs:
                    log.warning("Bulk errors (%s rows): %s", len(batch), errs[:2])
                batch.clear()
                if rows_processed % (batch_size * 4) == 0:
                    flush_checkpoint()

        if batch:
            n, errs = bulk_upsert(os_client, settings.products_index_alias, batch)
            rows_indexed += n
            if errs:
                log.warning("Bulk errors final chunk: %s", errs[:2])

        gz_stream.close()
        if response:
            response.close()

        with session_scope(SessionLocal) as s3:
            j3 = s3.get(IndexJobRow, job_id)
            if j3:
                j3.status = "completed"
                j3.rows_processed = rows_processed
                j3.rows_indexed = rows_indexed
                j3.error_message = None
                j3.updated_at = utcnow()
                s3.add(j3)

        try:
            os_client.indices.refresh(index=settings.products_index_alias)
        except Exception:  # noqa: BLE001
            log.warning("refresh index failed (alias may redirect)")

        log.info(
            "Job %s completed processed=%s indexed=%s",
            job_id,
            rows_processed,
            rows_indexed,
        )

    except Exception as exc:  # noqa: BLE001
        msg = str(exc)[:8000]
        log.exception("Job %s failed", job_id)
        with session_scope(SessionLocal) as s4:
            j4 = s4.get(IndexJobRow, job_id)
            if j4:
                j4.status = "failed"
                j4.error_message = msg
                j4.rows_processed = rows_processed
                j4.rows_indexed = rows_indexed
                j4.updated_at = utcnow()
                s4.add(j4)


def enqueue_job(job_id: UUID, settings: CommonSettings, redis_cli) -> None:
    redis_cli.lpush(settings.ingest_queue_key, str(job_id))


def dequeue_job_blocking(settings: CommonSettings, redis_cli, timeout_sec: int = 5):
    item = redis_cli.brpop(settings.ingest_queue_key, timeout=timeout_sec)
    if not item:
        return None
    _key, raw = item
    try:
        s = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
        return UUID(s)
    except Exception:
        log.warning("Invalid queue payload: %r", raw)
        return None

