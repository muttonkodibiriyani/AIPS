"""Standalone worker consuming Redis queue (run when embedded worker is disabled)."""
from __future__ import annotations

import logging

from redis import Redis

from commerce_ai_common import CommonSettings

from catalog_ingestion.db import Base, make_engine, make_session_factory
from catalog_ingestion.job_runner import dequeue_job_blocking, process_index_job

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def main() -> None:
    settings = CommonSettings()
    engine = make_engine(settings)
    Base.metadata.create_all(bind=engine)
    SessionLocal = make_session_factory(engine)
    redis_client = Redis.from_url(settings.redis_url, decode_responses=False)
    log.info("Worker started — queue=%s", settings.ingest_queue_key)

    while True:
        jid = dequeue_job_blocking(settings, redis_client, timeout_sec=5)
        if jid is None:
            continue
        try:
            process_index_job(jid, settings, SessionLocal)
        except Exception:
            log.exception("Unhandled job failure %s", jid)


if __name__ == "__main__":
    main()
