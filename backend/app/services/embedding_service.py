"""임베딩 서비스.

OpenAI 임베딩을 lazy하게 만들어서 `OPENAI_API_KEY` 미설정 환경에서도
import 단계에서 죽지 않도록 한다. 키가 없으면 `embed_*`은 None을 반환하고,
호출자는 dense/hybrid 검색을 BM25로 폴백한다.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings


class EmbeddingService:
    def __init__(self) -> None:
        self._embedder: Any | None = None
        self._tried = False

    def _get(self) -> Any | None:
        if self._tried:
            return self._embedder
        self._tried = True
        if not settings.openai_api_key:
            return None
        try:
            from langchain_openai import OpenAIEmbeddings
        except ImportError:
            return None
        self._embedder = OpenAIEmbeddings(
            model=settings.embedding_model,
            api_key=settings.openai_api_key,
        )
        return self._embedder

    @property
    def is_available(self) -> bool:
        return self._get() is not None

    async def embed_query(self, text: str) -> list[float] | None:
        embedder = self._get()
        if embedder is None:
            return None
        return await embedder.aembed_query(text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]] | None:
        embedder = self._get()
        if embedder is None:
            return None
        return await embedder.aembed_documents(texts)


_embedding_service = EmbeddingService()


def get_embedding_service() -> EmbeddingService:
    return _embedding_service
