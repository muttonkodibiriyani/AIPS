-- Commerce AI — initial schema for ingestion jobs & tenants stub
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    slug TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS index_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    object_key TEXT NOT NULL,
    original_filename TEXT,
    rows_processed BIGINT NOT NULL DEFAULT 0,
    rows_indexed BIGINT NOT NULL DEFAULT 0,
    error_message TEXT,
    meta_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_index_jobs_tenant ON index_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_index_jobs_status ON index_jobs (status);

INSERT INTO tenants (slug, name)
VALUES ('demo', 'Demo Tenant')
ON CONFLICT (slug) DO NOTHING;

