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

    # 두 가지 모두 OPENAI_API_KEY 하나에 의존 (현재 설정).
    # 나중에 임베더와 LLM을 다른 provider로 분리하면 여기를 갈라치면 됨.
    has_openai = bool(settings.openai_api_key)

    return {
        "status": "ok",
        "elasticsearch": es_ok,
        "embedder_available": has_openai,
        "llm_available": has_openai,
    }
