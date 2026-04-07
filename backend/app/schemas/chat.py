from typing import Literal

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    index: str | None = None
    messages: list[ChatMessage]
    top_k: int = 8


class Citation(BaseModel):
    """LLM 이 답변할 때 참고한 청크 한 건."""

    id: str
    index: str | None = None
    filename: str | None = None
    chunk_index: int | None = None
    score: float
    text: str


class ChatResponse(BaseModel):
    answer: str
    search_query: str | None = None  # extract_keywords 가 만든 검색용 쿼리
    citations: list[Citation] = []
