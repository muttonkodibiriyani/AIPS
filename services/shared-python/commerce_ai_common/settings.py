"""Shared configuration primitives."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class CommonSettings(BaseSettings):
    """Base env for all Commerce AI Python services."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env", "../../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_url: str = "postgresql://commerce:commerce@localhost:5432/commerce_ai"
    redis_url: str = "redis://localhost:6379/0"
    opensearch_url: str = "http://localhost:9200"
    minio_endpoint: str = "http://localhost:9000"
    minio_access_key: str = "commerce"
    minio_secret_key: str = "commercecommerce"
    minio_bucket: str = "catalog-feeds"
    minio_use_ssl: bool = False
    products_index_alias: str = "commerce-products"
    ingest_batch_size: int = 2500
    ingest_queue_key: str = "ingest:queue"
    embedded_ingest_worker: bool = True
