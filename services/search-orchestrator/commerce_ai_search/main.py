from fastapi import FastAPI

from commerce_ai_common import CommonSettings
from commerce_ai_search.routers.search_router import build_router

_settings = CommonSettings()
app = FastAPI(title="search-orchestrator", version="0.1.0")
app.include_router(build_router(_settings))
