from elasticsearch import AsyncElasticsearch
from fastapi import APIRouter, Depends

from app.core.config import settings
from app.db.elasticsearch import get_es_client

router = APIRouter()


@router.get("/health")
async def health(es: AsyncElasticsearch = Depends(get_es_client)) -> dict:
    es_ok = False
    try:
        await es.info()
        es_ok = True
    except Exception:  # noqa: BLE001
        es_ok = False

    has_openai = bool(settings.openai_api_key)

    return {
        "status": "ok",
        "elasticsearch": es_ok,
        "embedder_available": has_openai,
        "llm_available": has_openai,
    }
