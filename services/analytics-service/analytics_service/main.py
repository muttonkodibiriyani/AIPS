from typing import Annotated, Any

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="analytics-service", version="0.1.0")


class SearchEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    tenant_id: str = Field(..., alias="tenantId")
    session_id: str | None = Field(default=None, alias="sessionId")
    query: str
    normalized_query: str | None = Field(default=None, alias="normalizedQuery")
    locale: str | None = None
    filters: dict[str, Any] | None = None
    results: list[str] | None = None
    clicked_product_id: str | None = Field(default=None, alias="clickedProductId")
    added_to_cart: bool | None = Field(default=None, alias="addedToCart")
    converted: bool | None = None


class EventsBatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    events: Annotated[list[SearchEvent], Field(min_length=1)]


class Accepted(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    ingested: int
    accepted: bool


@app.get("/health")
def health():
    return {"ok": True, "service": "analytics-service"}


@app.post("/v1/analytics/events", response_model=Accepted)
def ingest_events(payload: EventsBatch):
    return Accepted(ingested=len(payload.events), accepted=True)

