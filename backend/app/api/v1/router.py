from fastapi import APIRouter

from app.api.v1.endpoints import chat, documents, health, indices, search

# WIP: RAGAS 평가 파이프라인은 아직 보류 상태. 코드/스키마/엔드포인트는 유지되어 있으며,
# 재개 시 아래 import와 include_router 두 줄의 주석을 풀고
# pyproject.toml의 ragas/datasets 의존성도 함께 활성화할 것.
# from app.api.v1.endpoints import evaluation

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(indices.router, prefix="/indices", tags=["indices"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
# api_router.include_router(evaluation.router, prefix="/eval", tags=["eval"])  # WIP
