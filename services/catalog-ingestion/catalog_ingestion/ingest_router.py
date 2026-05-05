from __future__ import annotations

import logging
import uuid
from datetime import timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from commerce_ai_common import CommonSettings

from catalog_ingestion.db import IndexJobRow, session_scope, utcnow
from catalog_ingestion.job_runner import enqueue_job
from catalog_ingestion.minio_ops import presign_put

log = logging.getLogger(__name__)

class PresignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    filename: str = Field(..., description="Original filename, e.g. catalog.csv.gz")


class PresignResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    upload_url: str = Field(serialization_alias="uploadUrl")
    bucket: str
    object_key: str = Field(serialization_alias="objectKey")
    expires_in: int = Field(serialization_alias="expiresIn")


class FeedImportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    object_key: str = Field(..., alias="objectKey")
    original_filename: str | None = Field(default=None, alias="originalFilename")
    default_market: str | None = Field(default="AE", alias="defaultMarket")


class FeedImportAccepted(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    accepted: bool
    job_id: str = Field(serialization_alias="jobId")
    tenant_id: str = Field(serialization_alias="tenantId")


class ReindexRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    mode: str = Field(default="incremental")


class ReindexJobQueued(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    job_id: str = Field(serialization_alias="jobId")
    tenant_id: str = Field(serialization_alias="tenantId")


class JobStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    job_id: str = Field(serialization_alias="jobId")
    tenant_id: str = Field(serialization_alias="tenantId")
    status: str
    object_key: str = Field(serialization_alias="objectKey")
    rows_processed: int = Field(serialization_alias="rowsProcessed")
    rows_indexed: int = Field(serialization_alias="rowsIndexed")
    error_message: str | None = Field(default=None, serialization_alias="errorMessage")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


def build_ingest_router(settings: CommonSettings, SessionLocal, redis_cli) -> APIRouter:
    r = APIRouter(tags=["catalog"])

    @r.post("/v1/admin/feeds/presign", response_model=PresignResponse)
    def presign(payload: PresignRequest):  # type: ignore[no-untyped-def]
        safe_name = payload.filename.replace("\\", "/").split("/")[-1]
        if not safe_name.lower().endswith((".csv.gz", ".gz")):
            raise HTTPException(
                status_code=400,
                detail="Upload must be gzip-compressed CSV (e.g. .csv.gz)",
            )
        object_key = f"feeds/{payload.tenant_id}/{uuid.uuid4().hex}_{safe_name}"
        url = presign_put(settings, object_key, expires_seconds=7200)
        return PresignResponse(
            upload_url=url,
            bucket=settings.minio_bucket,
            object_key=object_key,
            expires_in=7200,
        )

    @r.post("/v1/admin/feeds/import", response_model=FeedImportAccepted)
    def import_feed(payload: FeedImportRequest):  # type: ignore[no-untyped-def]
        job_id = uuid.uuid4()
        now = utcnow()
        meta = {"defaultMarket": payload.default_market or "AE"}
        with session_scope(SessionLocal) as sess:
            sess.add(
                IndexJobRow(
                    id=job_id,
                    tenant_id=payload.tenant_id,
                    status="queued",
                    object_key=payload.object_key,
                    original_filename=payload.original_filename,
                    rows_processed=0,
                    rows_indexed=0,
                    error_message=None,
                    meta_json=meta,
                    created_at=now,
                    updated_at=now,
                ),
            )
        enqueue_job(job_id, settings, redis_cli)
        log.info("Queued ingest job %s tenant=%s object=%s", job_id, payload.tenant_id, payload.object_key)
        return FeedImportAccepted(
            accepted=True,
            job_id=str(job_id),
            tenant_id=payload.tenant_id,
        )

    @r.get("/v1/admin/feeds/jobs/{job_id}", response_model=JobStatusResponse)
    def job_status(job_id: str):  # type: ignore[no-untyped-def]
        try:
            jid = UUID(job_id)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail="Invalid job id") from exc

        with session_scope(SessionLocal) as sess:
            job = sess.get(IndexJobRow, jid)
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            return JobStatusResponse(
                jobId=str(job.id),
                tenantId=job.tenant_id,
                status=job.status,
                objectKey=job.object_key,
                rowsProcessed=int(job.rows_processed),
                rowsIndexed=int(job.rows_indexed),
                errorMessage=job.error_message,
                createdAt=job.created_at.astimezone(timezone.utc).isoformat(),
                updatedAt=job.updated_at.astimezone(timezone.utc).isoformat(),
            )

    @r.post("/v1/internal/jobs/reindex", response_model=ReindexJobQueued)
    def reindex(payload: ReindexRequest):  # type: ignore[no-untyped-def]
        return ReindexJobQueued(job_id="stub-reindex", tenant_id=payload.tenant_id)

    return r

