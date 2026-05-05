from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field


app = FastAPI(title="agent-service", version="0.1.0")


class AgentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    session_id: str = Field(..., alias="sessionId")
    locale: str = Field(default="en-AE")
    message: str
    context: dict | None = None


class AgentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    answer: str = ""
    applied_filters: dict | None = Field(
        default_factory=dict,
        serialization_alias="appliedFilters",
    )
    products: list[dict] = Field(default_factory=list)
    follow_up_question: str | None = Field(
        default=None,
        serialization_alias="followUpQuestion",
    )


@app.get("/health")
def health():
    return {"ok": True, "service": "agent-service"}


@app.post("/v1/agent/query", response_model=AgentResponse)
def agent_query(payload: AgentRequest):
    return AgentResponse(
        answer="Agent stub — wire search orchestrator in Milestone 3.",
        applied_filters=payload.context or {},
        products=[],
        follow_up_question=None,
    )
