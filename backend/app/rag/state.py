from typing import Any, TypedDict


class MissingLLMError(RuntimeError):
    pass


class RagState(TypedDict, total=False):
    question: str
    search_query: str  # extract_keywords 가 만든 검색용 쿼리
    index: str | None
    top_k: int
    history: list[dict[str, Any]]
    documents: list[dict[str, Any]]  # retrieve 가 가져온 후보 청크 풀
    used_doc_ids: list[str]  # generate 가 실제 답변 근거로 삼은 문서 id
    answer: str
