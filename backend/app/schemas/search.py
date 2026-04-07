from typing import Any, Literal

from pydantic import BaseModel


class SearchRequest(BaseModel):
    index: str | None = None
    query: str
    mode: Literal["bm25", "dense", "hybrid"] = "hybrid"
    top_k: int = 10
    filters: dict[str, Any] | None = None


class SearchHit(BaseModel):
    id: str
    index: str | None = None
    score: float
    source: dict[str, Any]
    highlight: dict[str, list[str]] | None = None


class SearchResponse(BaseModel):
    total: int
    took_ms: int
    hits: list[SearchHit]
