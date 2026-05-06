from typing import Any, cast

from elasticsearch import AsyncElasticsearch

from app.core.config import settings

_client: AsyncElasticsearch | None = None


def get_es_client() -> AsyncElasticsearch:
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
    resp = await client.cat.indices(format="json", h="index")
    rows = cast(list[dict[str, Any]], resp.body)
    return [
        name
        for r in rows
        if (name := r.get("index")) and not name.startswith(".")
    ]
