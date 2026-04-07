from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.elasticsearch import close_es_client, get_es_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm up ES client
    client = get_es_client()
    try:
        await client.info()
    except Exception as exc:  # noqa: BLE001
        # Don't fail boot if ES isn't ready yet — log and continue.
        print(f"[startup] Elasticsearch not reachable yet: {exc}")
    yield
    await close_es_client()


app = FastAPI(
    title="RAGOps Studio API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"name": "RAGOps Studio", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
