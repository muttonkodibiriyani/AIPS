from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from commerce_ai_common import CommonSettings
from commerce_ai_search.adapters.opensearch_adapter import OpenSearchAdapter
from commerce_ai_search.query_parse import augment_filters


router = APIRouter(tags=["search"])


class Pagination(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: int | None = Field(default=0, alias="from")
    size: int = 24


class SearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str | None = Field(default=None, alias="tenantId")
    query: str
    locale: str = Field(default="en-AE")
    filters: dict[str, Any] | None = None
    context: dict[str, Any] | None = None
    pagination: Pagination = Field(default_factory=Pagination)


class Interpretation(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    lexical_weight: float = Field(default=0.5, serialization_alias="lexicalWeight")
    semantic_weight: float = Field(default=0.5, serialization_alias="semanticWeight")


class MatchExplain(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    lexical_score: float | None = Field(default=None, serialization_alias="lexicalScore")
    semantic_score: float | None = Field(default=None, serialization_alias="semanticScore")


class SearchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    products: list[dict[str, Any]] = Field(default_factory=list)
    facets: dict[str, Any] = Field(default_factory=dict)
    interpretation: Interpretation | None = None
    applied_filters: dict[str, Any] = Field(default_factory=dict, serialization_alias="appliedFilters")
    total: int = 0


def build_router(settings: CommonSettings, adapter_or_none: Any = None):  # noqa: ANN401
    adapter = adapter_or_none or OpenSearchAdapter(settings)

    @router.get("/health")
    def health():  # type: ignore[no-untyped-def]
        alive = adapter.ping()
        return {"ok": True, "service": "search-orchestrator", "open_search": alive}

    @router.post("/v1/search", response_model=SearchResponse)
    def search(payload: SearchRequest):  # type: ignore[no-untyped-def]
        filters = payload.filters.copy() if payload.filters else {}
        ctx = payload.context or {}
        for key in ("market",):
            if key in ctx and key not in filters:
                filters[key] = ctx[key]

        market_guess = str(ctx.get("market") or filters.get("market") or "AE")
        lexical_query, augmented = augment_filters(payload.query, filters, market_guess)
        if payload.filters:
            augmented.update(payload.filters)
        if ctx and "market" in ctx and "market" not in augmented:
            augmented["market"] = ctx["market"]

        lexical_w = float(ctx.get("lexicalWeight", 0.5))
        semantic_w = float(ctx.get("semanticWeight", 0.5))
        tenant = payload.tenant_id or ctx.get("tenantId") or "demo"

        if not adapter.ping():
            fallback = MatchExplain(lexical_score=1.0, semantic_score=None)
            return SearchResponse(
                total=1,
                products=[
                    {
                        "product_id": "stub-demo",
                        "title": {"en": "Demo product", "ar": ""},
                        "why": {
                            "explain": fallback.model_dump(by_alias=True),
                            "stub": True,
                            "reason": "OpenSearch unreachable — start OpenSearch and ingest your catalog.",
                        },
                    },
                ],
                facets={},
                interpretation=Interpretation(lexical_weight=lexical_w, semantic_weight=semantic_w),
                applied_filters=augmented,
            )

        result = adapter.hybrid_search(
            tenant_id=str(tenant),
            query=lexical_query,
            locale=payload.locale,
            filters=augmented,
            pagination_from=payload.pagination.from_ if payload.pagination else 0,
            pagination_size=min(payload.pagination.size if payload.pagination else 24, 100),
            query_vector=None,
            lexical_weight=lexical_w,
            semantic_weight=semantic_w,
        )

        products_out: list[dict[str, Any]] = []
        for h in result.get("hits", []):
            src = dict(h.get("_source", {}) or {})
            src["_score"] = h.get("_score")
            explain = MatchExplain(
                lexical_score=float(h.get("_score", 0) or 0),
                semantic_score=None,
            )
            existing_why = src.get("why")
            why_wrapped: dict[str, Any]
            why_wrapped = dict(existing_why) if isinstance(existing_why, dict) else {}
            why_wrapped["explain"] = explain.model_dump(by_alias=True)
            src["why"] = why_wrapped
            products_out.append(src)

        return SearchResponse(
            total=int(result.get("total", len(products_out))),
            products=products_out,
            facets=result.get("facets", {}) or {},
            interpretation=Interpretation(lexical_weight=lexical_w, semantic_weight=semantic_w),
            applied_filters=augmented,
        )

    @router.get("/v1/autocomplete")
    def autocomplete(
        q: str = "",
        _tenant_id: str | None = None,
        locale: str = "en-AE",
    ):  # type: ignore[no-untyped-def]
        """Prefix suggestions — scaffold returns []; wire Edge N-gram analyzer in Milestone 2."""

        del _tenant_id, locale
        if len(q.strip()) == 0 or not adapter.ping():
            return {"suggestions": []}
        return {"suggestions": []}

    return router
