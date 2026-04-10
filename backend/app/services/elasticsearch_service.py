import asyncio
from time import perf_counter
from typing import Any

from elasticsearch import AsyncElasticsearch
from fastapi import HTTPException

from app.core.config import settings
from app.db.elasticsearch import get_es_client, list_user_index_names
from app.schemas.index import IndexInfo
from app.schemas.search import SearchHit, SearchMode, SearchRequest, SearchResponse
from app.services.embedding_service import EmbeddingService, get_embedding_service

RRF_K = 60  # Reciprocal Rank Fusion 의 k 상수 (보통 60)


def default_mapping() -> dict[str, Any]:
    """기본 RAG 인덱스 매핑.

    text는 BM25용 분석 필드, embedding은 dense_vector(cosine).
    metadata는 dynamic으로 받는다.
    """
    return {
        "mappings": {
            "properties": {
                "text": {"type": "text"},
                "embedding": {
                    "type": "dense_vector",
                    "dims": settings.embedding_dims,
                    "index": True,
                    "similarity": "cosine",
                },
                "metadata": {"type": "object", "enabled": True},
            }
        }
    }


class ElasticsearchService:
    def __init__(self, client: AsyncElasticsearch, embedder: EmbeddingService):
        self.client = client
        self.embedder = embedder

    # ---------- Index management ----------

    async def list_indices(self) -> list[IndexInfo]:
        rows = await self.client.cat.indices(format="json", bytes="b")
        result: list[IndexInfo] = []
        for row in rows:
            name = row.get("index", "")
            if name.startswith("."):
                continue
            result.append(
                IndexInfo(
                    name=name,
                    docs_count=int(row.get("docs.count") or 0),
                    size_in_bytes=int(row.get("store.size") or 0),
                    health=row.get("health"),
                )
            )
        return result

    async def create_index(
        self,
        name: str,
        mappings: dict | None = None,
        index_settings: dict | None = None,
    ) -> None:
        body: dict = {}
        if mappings:
            body["mappings"] = mappings
        else:
            # 기본 RAG 매핑 (text + dense_vector + metadata)
            body.update(default_mapping())
        if index_settings:
            body["settings"] = index_settings
        await self.client.indices.create(index=name, body=body or None)

    async def delete_index(self, name: str) -> None:
        await self.client.indices.delete(index=name, ignore_unavailable=True)

    async def clear_index(self, name: str) -> int:
        """인덱스 매핑은 유지한 채 모든 도큐먼트만 삭제. 삭제된 도큐먼트 수 반환."""
        resp = await self.client.delete_by_query(
            index=name,
            body={"query": {"match_all": {}}},
            refresh=True,
            conflicts="proceed",
        )
        return int(resp.get("deleted", 0))

    async def ensure_default_index(self, name: str | None = None) -> str:
        """존재하지 않으면 기본 매핑으로 생성하고 인덱스 이름을 돌려준다."""
        index = name or settings.default_index
        exists = await self.client.indices.exists(index=index)
        if not exists:
            await self.create_index(index)
        return index

    # ---------- Search ----------

    async def search(self, req: SearchRequest) -> SearchResponse:
        # 인덱스가 지정되면 그것만 (없으면 자동 생성)
        # 비어있으면 사용자 인덱스 목록을 동적으로 가져와 모두 대상으로
        if req.index:
            index: str = await self.ensure_default_index(req.index)
        else:
            names = await list_user_index_names(self.client)
            if not names:
                return SearchResponse(total=0, took_ms=0, hits=[])
            index = ",".join(names)

        # dense / hybrid 는 임베딩 필수. 없으면 폴백 없이 명시적 에러.
        if req.mode in (SearchMode.DENSE, SearchMode.HYBRID) and not self.embedder.is_available:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Dense/Hybrid 검색은 임베딩이 필요합니다. "
                    "backend/.env 의 OPENAI_API_KEY 를 설정한 뒤 백엔드를 재시작하거나, "
                    "검색 모드를 BM25 로 바꿔주세요."
                ),
            )

        started = perf_counter()
        if req.mode == SearchMode.BM25:
            hits, total = await self._search_bm25(index, req)
        elif req.mode == SearchMode.DENSE:
            hits, total = await self._search_dense(index, req)
        else:
            hits, total = await self._search_hybrid_rrf(index, req)
        took_ms = int((perf_counter() - started) * 1000)

        return SearchResponse(total=total, took_ms=took_ms, hits=hits)

    # ---------- 모드별 내부 구현 ----------

    def _hit(self, h: dict, score_override: float | None = None) -> SearchHit:
        return SearchHit(
            id=h["_id"],
            index=h.get("_index"),
            score=score_override if score_override is not None else (h.get("_score") or 0.0),
            source={k: v for k, v in h.get("_source", {}).items() if k != "embedding"},
            highlight=h.get("highlight"),
        )

    def _filter_clause(self, req: SearchRequest) -> list[dict[str, Any]] | None:
        if not req.filters:
            return None
        return [{"term": {k: v}} for k, v in req.filters.items()]

    async def _search_bm25(
        self, index: str, req: SearchRequest
    ) -> tuple[list[SearchHit], int]:
        query: dict[str, Any] = {"match": {"text": req.query}}
        filters = self._filter_clause(req)
        if filters:
            query = {"bool": {"must": [query], "filter": filters}}
        body = {
            "size": req.top_k,
            "query": query,
            "highlight": {"fields": {"text": {}}},
            "_source": {"excludes": ["embedding"]},
        }
        resp = await self.client.search(
            index=index,
            body=body,
            ignore_unavailable=True,
            allow_no_indices=True,
        )
        hits = [self._hit(h) for h in resp["hits"]["hits"]]
        return hits, resp["hits"]["total"]["value"]

    async def _search_dense(
        self, index: str, req: SearchRequest
    ) -> tuple[list[SearchHit], int]:
        query_vector = await self.embedder.embed_query(req.query)
        if query_vector is None:
            # is_available 체크를 통과했는데 None이면 모순 — 방어적 에러
            raise HTTPException(status_code=500, detail="임베딩 생성 실패")

        body: dict[str, Any] = {
            "size": req.top_k,
            "knn": {
                "field": "embedding",
                "query_vector": query_vector,
                "k": req.top_k,
                "num_candidates": max(50, req.top_k * 5),
            },
            "_source": {"excludes": ["embedding"]},
        }
        filters = self._filter_clause(req)
        if filters:
            body["knn"]["filter"] = filters
        resp = await self.client.search(
            index=index,
            body=body,
            ignore_unavailable=True,
            allow_no_indices=True,
        )
        hits = [self._hit(h) for h in resp["hits"]["hits"]]
        return hits, resp["hits"]["total"]["value"]

    async def _search_hybrid_rrf(
        self, index: str, req: SearchRequest
    ) -> tuple[list[SearchHit], int]:
        """진짜 Hybrid: BM25 와 kNN 을 별도로 돌리고 RRF 로 머지.

        ES 의 query+knn 단순 합산은 BM25 점수가 압도하는 문제가 있어,
        rank 기반 RRF 로 결합한다.
            score(d) = Σ_r 1 / (k + rank_r(d))
        """
        # 각 ranking 에서 top_k * 2 정도를 가져와 머지 풀을 넓힘
        pool = max(req.top_k * 2, 20)

        async def _bm25() -> dict[str, Any]:
            query: dict[str, Any] = {"match": {"text": req.query}}
            filters = self._filter_clause(req)
            if filters:
                query = {"bool": {"must": [query], "filter": filters}}
            return await self.client.search(
                index=index,
                body={
                    "size": pool,
                    "query": query,
                    "highlight": {"fields": {"text": {}}},
                    "_source": {"excludes": ["embedding"]},
                },
                ignore_unavailable=True,
                allow_no_indices=True,
            )

        async def _knn() -> dict[str, Any]:
            query_vector = await self.embedder.embed_query(req.query)
            if query_vector is None:
                raise HTTPException(status_code=500, detail="임베딩 생성 실패")
            knn: dict[str, Any] = {
                "field": "embedding",
                "query_vector": query_vector,
                "k": pool,
                "num_candidates": max(100, pool * 5),
            }
            filters = self._filter_clause(req)
            if filters:
                knn["filter"] = filters
            return await self.client.search(
                index=index,
                body={
                    "size": pool,
                    "knn": knn,
                    "_source": {"excludes": ["embedding"]},
                },
                ignore_unavailable=True,
                allow_no_indices=True,
            )

        bm25_resp, knn_resp = await asyncio.gather(_bm25(), _knn())

        # RRF 머지 — 동일 도큐먼트는 (index, _id) 키로 식별
        scores: dict[tuple[str, str], float] = {}
        docs: dict[tuple[str, str], dict] = {}

        def _accumulate(resp: dict[str, Any]) -> None:
            for rank, h in enumerate(resp["hits"]["hits"]):
                key = (h.get("_index") or "", h["_id"])
                scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
                # bm25 resp 를 우선해 (highlight 포함되어 있으니)
                if key not in docs:
                    docs[key] = h

        _accumulate(bm25_resp)
        _accumulate(knn_resp)

        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[: req.top_k]
        hits = [self._hit(docs[key], score_override=score) for key, score in ranked]

        # total 은 두 결과의 union 크기 (정확한 ES total 보다 의미 있음)
        total = len(scores)
        return hits, total


def get_es_service() -> ElasticsearchService:
    """ES 서비스 인스턴스. FastAPI Depends 와 일반 호출 모두 동일하게 사용 가능.

    내부의 client/embedder 는 모두 싱글톤이라 매 호출이 가벼움.
    """
    return ElasticsearchService(get_es_client(), get_embedding_service())
