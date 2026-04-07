import uuid

from elasticsearch import AsyncElasticsearch
from elasticsearch.helpers import async_bulk
from fastapi import Depends, HTTPException

from app.db.elasticsearch import get_es_client
from app.schemas.document import (
    DocumentIngestRequest,
    DocumentIngestResponse,
    FileChunk,
    FileDetail,
    FileSummary,
)
from app.services.elasticsearch_service import (
    ElasticsearchService,
    get_es_service,
)
from app.services.embedding_service import EmbeddingService, get_embedding_service


def _chunk_text(text: str, size: int, overlap: int) -> list[str]:
    if size <= 0:
        return [text]
    chunks: list[str] = []
    step = max(1, size - overlap)
    for start in range(0, len(text), step):
        chunks.append(text[start : start + size])
        if start + size >= len(text):
            break
    return chunks


class DocumentService:
    def __init__(
        self,
        client: AsyncElasticsearch,
        es_service: ElasticsearchService,
        embedder: EmbeddingService,
    ):
        self.client = client
        self.es_service = es_service
        self.embedder = embedder

    async def ingest_text(
        self,
        req: DocumentIngestRequest,
        allow_no_embedding: bool = False,
    ) -> DocumentIngestResponse:
        """문서를 청킹·임베딩 후 인덱싱.

        embedder 가 없을 때:
          - allow_no_embedding=False (기본): 명시적으로 400 에러
          - allow_no_embedding=True: 임베딩 없이 BM25 전용으로 저장
        """
        index = await self.es_service.ensure_default_index(req.index)
        chunks = _chunk_text(req.text, req.chunk_size, req.chunk_overlap)
        ids: list[str] = [str(uuid.uuid4()) for _ in chunks]

        embeddings: list[list[float]] | None = None
        if chunks:
            if self.embedder.is_available:
                embeddings = await self.embedder.embed_documents(chunks)
            elif not allow_no_embedding:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "임베딩이 필요한데 OPENAI_API_KEY 가 설정되지 않았습니다. "
                        "backend/.env 에 키를 설정한 뒤 백엔드를 재시작하거나, "
                        "임베딩 없이 BM25 전용으로 저장하려면 'allow_no_embedding=true' 로 다시 시도하세요."
                    ),
                )

        actions = []
        total = len(chunks)
        for i, chunk in enumerate(chunks):
            chunk_metadata = {
                **req.metadata,
                "chunk_index": i,
                "chunk_total": total,
            }
            source: dict = {"text": chunk, "metadata": chunk_metadata}
            if embeddings is not None:
                source["embedding"] = embeddings[i]
            actions.append(
                {
                    "_op_type": "index",
                    "_index": index,
                    "_id": ids[i],
                    "_source": source,
                }
            )
        if actions:
            await async_bulk(self.client, actions)
        return DocumentIngestResponse(index=index, chunks_indexed=len(ids), ids=ids)

    async def list_files(self, index: str | None = None) -> list[FileSummary]:
        """metadata.filename 별로 청크 수를 집계."""
        idx = await self.es_service.ensure_default_index(index)
        resp = await self.client.search(
            index=idx,
            body={
                "size": 0,
                "aggs": {
                    "by_filename": {
                        "terms": {
                            "field": "metadata.filename.keyword",
                            "size": 1000,
                            "order": {"_key": "asc"},
                        }
                    }
                },
            },
        )
        buckets = resp.get("aggregations", {}).get("by_filename", {}).get("buckets", [])
        return [
            FileSummary(filename=b["key"], chunk_count=b["doc_count"])
            for b in buckets
        ]

    async def delete_file(self, filename: str, index: str | None = None) -> int:
        """특정 filename에 속한 모든 청크를 삭제. 삭제된 청크 수 반환."""
        idx = await self.es_service.ensure_default_index(index)
        resp = await self.client.delete_by_query(
            index=idx,
            body={"query": {"term": {"metadata.filename.keyword": filename}}},
            refresh=True,
            conflicts="proceed",
        )
        return int(resp.get("deleted", 0))

    async def get_file_chunks(
        self,
        filename: str,
        index: str | None = None,
    ) -> FileDetail:
        """특정 파일에 속한 모든 청크를 chunk_index 순으로 반환."""
        idx = await self.es_service.ensure_default_index(index)
        resp = await self.client.search(
            index=idx,
            body={
                "size": 1000,
                "query": {
                    "term": {"metadata.filename.keyword": filename}
                },
                # unmapped_type: 기존 인덱스에 chunk_index 매핑이 없을 수도 있어
                # ES가 sort field를 인식하지 못하면 BadRequest. 이걸 long 으로 가정.
                "sort": [
                    {
                        "metadata.chunk_index": {
                            "order": "asc",
                            "unmapped_type": "long",
                            "missing": "_last",
                        }
                    }
                ],
                "_source": {"excludes": ["embedding"]},
            },
        )
        hits = resp["hits"]["hits"]
        # chunk_index가 없는 옛 도큐먼트는 받은 순서대로 0부터 부여
        chunks: list[FileChunk] = []
        fallback_idx = 0
        for h in hits:
            meta = h["_source"].get("metadata", {}) or {}
            ci = meta.get("chunk_index")
            if ci is None:
                ci = fallback_idx
                fallback_idx += 1
            chunks.append(
                FileChunk(
                    id=h["_id"],
                    chunk_index=int(ci),
                    text=h["_source"].get("text", ""),
                )
            )
        return FileDetail(
            filename=filename,
            chunk_count=len(chunks),
            chunks=chunks,
        )


def get_document_service(
    client: AsyncElasticsearch = Depends(get_es_client),
    es_service: ElasticsearchService = Depends(get_es_service),
    embedder: EmbeddingService = Depends(get_embedding_service),
) -> DocumentService:
    return DocumentService(client, es_service, embedder)
