from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis import Redis

from commerce_ai_common import CommonSettings

from catalog_ingestion.db import Base, make_engine, make_session_factory
from catalog_ingestion.health_router import router as health_router
from catalog_ingestion.ingest_router import build_ingest_router
from catalog_ingestion.job_runner import dequeue_job_blocking, process_index_job
from catalog_ingestion.minio_ops import ensure_bucket as ensure_minio_bucket

log = logging.getLogger(__name__)


settings = CommonSettings()
engine = make_engine(settings)
SessionLocal = make_session_factory(engine)
redis_client = Redis.from_url(settings.redis_url, decode_responses=False)


def _embedded_worker_loop() -> None:
    logging.basicConfig(level=logging.INFO)
    wlog = logging.getLogger("ingest_worker")
    wlog.info("Embedded ingest worker listening on %s", settings.ingest_queue_key)
    while True:
        jid = dequeue_job_blocking(settings, redis_client, timeout_sec=5)
        if jid is None:
            continue
        try:
            process_index_job(jid, settings, SessionLocal)
        except Exception:
            wlog.exception("Unhandled failure processing job %s", jid)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    try:
        ensure_minio_bucket(settings)
    except Exception as exc:  # noqa: BLE001
        log.warning("MinIO bucket ensure failed (start MinIO first): %s", exc)

    if settings.embedded_ingest_worker:
        threading.Thread(target=_embedded_worker_loop, daemon=True, name="ingest-worker").start()
    yield


app = FastAPI(title="catalog-ingestion", version="0.2.0", lifespan=lifespan)
app.include_router(health_router)
app.include_router(build_ingest_router(settings, SessionLocal, redis_client))

