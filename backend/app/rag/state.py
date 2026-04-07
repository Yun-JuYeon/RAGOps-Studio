"""LangGraph state 와 관련 예외."""

from typing import Any, TypedDict


class MissingLLMError(RuntimeError):
    """generate 노드에 필요한 LLM 이 설정되지 않았을 때."""


class RagState(TypedDict, total=False):
    question: str
    search_query: str  # extract_keywords 가 만든 검색용 쿼리
    index: str | None
    top_k: int
    history: list[dict[str, Any]]
    documents: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    answer: str
