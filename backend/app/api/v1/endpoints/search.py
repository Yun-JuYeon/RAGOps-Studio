from fastapi import APIRouter, Depends

from app.schemas.search import SearchRequest, SearchResponse
from app.services.elasticsearch_service import ElasticsearchService, get_es_service

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    svc: ElasticsearchService = Depends(get_es_service),
):
    return await svc.search(body)
