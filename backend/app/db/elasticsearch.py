from elasticsearch import AsyncElasticsearch

from app.core.config import settings

_client: AsyncElasticsearch | None = None


def get_es_client() -> AsyncElasticsearch:
    """Return a process-wide AsyncElasticsearch singleton."""
    global _client
    if _client is None:
        auth = None
        if settings.elasticsearch_username and settings.elasticsearch_password:
            auth = (settings.elasticsearch_username, settings.elasticsearch_password)
        _client = AsyncElasticsearch(
            hosts=[settings.elasticsearch_url],
            basic_auth=auth,
        )
    return _client


async def close_es_client() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def list_user_index_names(client: AsyncElasticsearch) -> list[str]:
    """시스템 인덱스(.으로 시작)를 제외한 사용자 인덱스 이름 목록.

    "전체 인덱스" 검색 시 어떤 인덱스를 대상으로 할지 결정하는 단일 진실 원천.
    인덱스 페이지(`list_indices`)와 동일한 필터링 규칙을 사용한다.
    """
    rows = await client.cat.indices(format="json", h="index")
    return [
        r["index"]
        for r in rows
        if r.get("index") and not r["index"].startswith(".")
    ]
