from __future__ import annotations

from datetime import timedelta
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from commerce_ai_common import CommonSettings


def _endpoint_and_secure(settings: CommonSettings) -> tuple[str, bool]:
    u = urlparse(settings.minio_endpoint)
    host = u.hostname or "localhost"
    port = u.port
    secure = settings.minio_use_ssl or (u.scheme == "https")
    if port:
        return f"{host}:{port}", secure
    return host, secure


def _client(settings: CommonSettings) -> Minio:
    endpoint, secure = _endpoint_and_secure(settings)
    return Minio(
        endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
    )


def ensure_bucket(settings: CommonSettings) -> None:
    client = _client(settings)
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except S3Error:
        raise


def presign_put(settings: CommonSettings, object_key: str, expires_seconds: int = 7200) -> str:
    client = _client(settings)
    return client.presigned_put_object(
        settings.minio_bucket,
        object_key,
        expires=timedelta(seconds=expires_seconds),
    )


def get_object_stream(settings: CommonSettings, object_key: str):
    client = _client(settings)
    return client.get_object(settings.minio_bucket, object_key)

