from __future__ import annotations

from typing import Any

from pydantic import SecretStr

from app.core.config import settings


class EmbeddingService:
    def __init__(self) -> None:
        self._embedder: Any | None = None
        if settings.openai_api_key:
            from langchain_openai import OpenAIEmbeddings

            self._embedder = OpenAIEmbeddings(
                model=settings.embedding_model,
                api_key=SecretStr(settings.openai_api_key),
            )

    @property
    def is_available(self) -> bool:
        return self._embedder is not None

    async def embed_query(self, text: str) -> list[float] | None:
        if self._embedder is None:
            return None
        return await self._embedder.aembed_query(text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]] | None:
        if self._embedder is None:
            return None
        return await self._embedder.aembed_documents(texts)


_embedding_service = EmbeddingService()


def get_embedding_service() -> EmbeddingService:
    return _embedding_service
