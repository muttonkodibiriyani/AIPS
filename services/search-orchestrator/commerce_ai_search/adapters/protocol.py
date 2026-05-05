"""Search engine portability layer — OpenSearch implementation + future Vespa/Qdrant stubs."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypedDict


class HybridSearchHit(TypedDict, total=False):
    _id: str
    _score: float
    _source: dict[str, Any]


class HybridSearchResult(TypedDict, total=False):
    hits: list[HybridSearchHit]
    facets: dict[str, Any]
    total: int


class SearchEngineAdapter(ABC):
    @abstractmethod
    def ping(self) -> bool: ...

    @abstractmethod
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
    ) -> HybridSearchResult: ...

    @abstractmethod
    def index_bulk(self, documents: list[dict[str, Any]]) -> dict[str, Any]: ...

    @abstractmethod
    def delete_by_tenant(self, tenant_id: str) -> dict[str, Any]: ...

    @abstractmethod
    def facet_aggs(self, tenant_id: str, field: str, size: int = 24) -> dict[str, Any]: ...
