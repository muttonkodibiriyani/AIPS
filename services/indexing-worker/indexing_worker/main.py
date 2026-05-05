from fastapi import FastAPI

app = FastAPI(title="indexing-worker", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "indexing-worker"}

