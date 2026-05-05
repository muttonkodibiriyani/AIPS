from __future__ import annotations

from typing import Any

from opensearchpy import OpenSearch
from opensearchpy.helpers import streaming_bulk

from commerce_ai_common import CommonSettings


def make_os_client(settings: CommonSettings) -> OpenSearch:
    return OpenSearch(
        hosts=[settings.opensearch_url],
        verify_certs=False,
        ssl_show_warn=False,
        timeout=120,
        max_retries=2,
        retry_on_timeout=True,
    )


def bulk_upsert(
    client: OpenSearch,
    index_alias: str,
    docs: list[dict[str, Any]],
) -> tuple[int, list[Any]]:
    """Each doc included `_id` for upsert."""

    errors: list[Any] = []

    def actions():
        for d in docs:
            payload = dict(d)
            oid = payload.pop("_id", None)
            if not oid:
                continue
            yield {"_op_type": "index", "_index": index_alias, "_id": oid, "_source": payload}

    successes = 0
    for ok, row in streaming_bulk(client, actions(), raise_on_error=False, chunk_size=500):
        if ok:
            successes += 1
        else:
            errors.append(row)
    return successes, errors

