from __future__ import annotations

from typing import Any

from opensearchpy import OpenSearch
from opensearchpy.helpers import streaming_bulk

from commerce_ai_common import CommonSettings
from commerce_ai_search.adapters.protocol import HybridSearchHit, HybridSearchResult, SearchEngineAdapter


def _price_field(market: str | None) -> str:
    m = (str(market or "AE")).upper()
    if m in ("SA", "KSA"):
        return "pricing.SA"
    return "pricing.AE"


def _facet_buckets(rs: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    aggs = rs.get("aggregations") if isinstance(rs, dict) else None
    if not isinstance(aggs, dict):
        return out
    for name, node in aggs.items():
        buckets = node.get("buckets", []) if isinstance(node, dict) else []
        out[name] = [{"key": b.get("key"), "count": b.get("doc_count")} for b in buckets if isinstance(b, dict)]
    return out


class OpenSearchAdapter(SearchEngineAdapter):
    """OpenSearch retrieval — BM25 lexical + facets; optional semantic later via query_vector."""

    def __init__(self, settings: CommonSettings | None = None) -> None:
        self.settings = settings or CommonSettings()
        self.client = OpenSearch(
            hosts=[self.settings.opensearch_url],
            verify_certs=False,
            ssl_show_warn=False,
            timeout=60,
            max_retries=2,
            retry_on_timeout=True,
        )

    def ping(self) -> bool:
        try:
            return bool(self.client.ping(request_timeout=5))
        except Exception:
            return False

    def hybrid_search(
        self,
        *,
        tenant_id: str,
        query: str,
        locale: str,
        filters: dict[str, Any] | None,
        pagination_from: int,
        pagination_size: int,
        query_vector: list[float] | None,
        lexical_weight: float,
        semantic_weight: float,
    ) -> HybridSearchResult:
        del query_vector
        lm = lexical_weight if lexical_weight else 1

        lexical_field = "search_text.ar" if locale.lower().startswith("ar") else "search_text.en"
        must_filter: list[dict[str, Any]] = [{"term": {"tenant_id": tenant_id}}]
        parsed = dict(filters or {})

        market = parsed.get("market")
        if market:
            must_filter.append({"term": {"market": str(market)}})

        color = parsed.get("color")
        if color:
            must_filter.append({"term": {"attrs.color.keyword": str(color)}})

        availability = parsed.get("availability")
        if availability is not None:
            must_filter.append({"term": {"availability": bool(availability)}})

        price_max = parsed.get("priceMax")
        price_min = parsed.get("priceMin")
        pf = _price_field(str(market) if market else "AE")

        rng: dict[str, float] = {}
        if isinstance(price_max, (int, float)):
            rng["lte"] = float(price_max)
        if isinstance(price_min, (int, float)):
            rng["gte"] = float(price_min)
        if rng:
            must_filter.append({"range": {pf: rng}})

        del semantic_weight

        qtext = (query or "").strip()
        must_clause: list[dict[str, Any]]
        if qtext == "":
            must_clause = [{"match_all": {}}]
        else:
            must_clause = [
                {
                    "multi_match": {
                        "query": qtext,
                        "type": "best_fields",
                        "fields": [
                            lexical_field,
                            "sku^3",
                            "title.en",
                            "title.ar",
                        ],
                        "boost": lm,
                    },
                },
            ]

        body: dict[str, Any] = {
            "from": pagination_from,
            "size": pagination_size,
            "track_total_hits": True,
            "query": {
                "bool": {
                    "filter": must_filter,
                    "must": must_clause,
                },
            },
            "aggs": {
                "colors": {
                    "terms": {"field": "attrs.color.keyword", "size": 40, "missing": "__none__"},
                },
                "markets": {"terms": {"field": "market", "size": 16}},
            },
        }

        rs = self.client.search(index=self.settings.products_index_alias, body=body)
        hits = (rs.get("hits", {}) or {}).get("hits", []) if isinstance(rs, dict) else []
        mapped: list[HybridSearchHit] = []
        for h in hits:
            mapped.append(
                {
                    "_id": str(h.get("_id", "")),
                    "_score": float(h.get("_score", 0) or 0),
                    "_source": h.get("_source", {}) or {},
                },
            )

        total_wrap = (rs.get("hits", {}) or {}).get("total", 0) if isinstance(rs, dict) else 0
        if isinstance(total_wrap, dict):
            total = int(total_wrap.get("value", 0) or 0)
        else:
            total = int(total_wrap or 0)

        facets = _facet_buckets(rs) if isinstance(rs, dict) else {}
        return HybridSearchResult(hits=mapped, facets=facets, total=total)

    def index_bulk(self, documents: list[dict[str, Any]]) -> dict[str, Any]:
        successes = 0
        errors: list[Any] = []

        def actions():
            for d in documents:
                src = dict(d)
                oid = src.pop("_id", None)
                if not oid:
                    continue
                yield {"_op_type": "index", "_index": self.settings.products_index_alias, "_id": oid, "_source": src}

        for ok, item in streaming_bulk(self.client, actions(), raise_on_error=False, chunk_size=500):
            if ok:
                successes += 1
            else:
                errors.append(item)
        return {"indexed": successes, "errors": errors}

    def delete_by_tenant(self, tenant_id: str) -> dict[str, Any]:
        resp = self.client.delete_by_query(
            index=self.settings.products_index_alias,
            body={"query": {"term": {"tenant_id": tenant_id}}},
            refresh=True,
        )
        return dict(resp)

    def facet_aggs(self, tenant_id: str, field: str, size: int = 24) -> dict[str, Any]:
        body = {
            "size": 0,
            "query": {"term": {"tenant_id": tenant_id}},
            "aggs": {"facets": {"terms": {"field": field, "size": size}}},
        }
        resp = self.client.search(index=self.settings.products_index_alias, body=body)
        return dict(resp)


def build_default_adapter() -> SearchEngineAdapter:
    return OpenSearchAdapter()
