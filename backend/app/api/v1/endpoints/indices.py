from fastapi import APIRouter, Depends, HTTPException

from app.schemas.index import CreateIndexRequest, IndexInfo
from app.services.elasticsearch_service import ElasticsearchService, get_es_service

router = APIRouter()


@router.get("", response_model=list[IndexInfo])
async def list_indices(svc: ElasticsearchService = Depends(get_es_service)):
    return await svc.list_indices()


@router.post("", status_code=201)
async def create_index(
    body: CreateIndexRequest,
    svc: ElasticsearchService = Depends(get_es_service),
):
    try:
        await svc.create_index(body.name, body.mappings, body.settings)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"name": body.name, "created": True}


@router.delete("/{name}", status_code=204)
async def delete_index(name: str, svc: ElasticsearchService = Depends(get_es_service)):
    await svc.delete_index(name)


@router.post("/{name}/clear")
async def clear_index(name: str, svc: ElasticsearchService = Depends(get_es_service)):
    """매핑은 유지한 채 인덱스 안의 모든 도큐먼트 삭제."""
    deleted = await svc.clear_index(name)
    return {"name": name, "deleted": deleted}
