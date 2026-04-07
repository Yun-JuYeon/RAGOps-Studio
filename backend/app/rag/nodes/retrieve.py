"""retrieve 노드.

extract_keywords 가 만든 search_query 를 사용해 ElasticsearchService.search() 호출.
검색 페이지와 동일한 hybrid + RRF 로직 (임베더가 없으면 BM25).
"""

from typing import Any

from app.rag.state import RagState
from app.schemas.search import SearchRequest
from app.services.elasticsearch_service import get_es_service


async def retrieve(state: RagState) -> RagState:
    es_service = get_es_service()
    mode = "hybrid" if es_service.embedder.is_available else "bm25"
    query = state.get("search_query") or state.get("question", "")
    req = SearchRequest(
        query=query,
        mode=mode,
        top_k=state.get("top_k", 5),
        index=state.get("index"),
    )
    resp = await es_service.search(req)

    docs: list[dict[str, Any]] = []
    for h in resp.hits:
        metadata = h.source.get("metadata") or {}
        docs.append(
            {
                "id": h.id,
                "index": h.index,
                "score": h.score,
                "text": str(h.source.get("text", "")),
                "filename": metadata.get("filename"),
                "chunk_index": metadata.get("chunk_index"),
            }
        )

    return {
        "documents": docs,
        "citations": [
            {
                "id": d["id"],
                "index": d.get("index"),
                "filename": d.get("filename"),
                "chunk_index": d.get("chunk_index"),
                "score": d["score"],
                "text": d["text"],
            }
            for d in docs
        ],
    }
