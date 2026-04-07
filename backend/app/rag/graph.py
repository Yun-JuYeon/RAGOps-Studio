"""LangGraph 기반 RAG 파이프라인.

retrieve → generate 2-노드. 추후 query rewriting, re-ranking,
guardrails 등을 노드로 추가할 수 있다.
"""

from typing import TYPE_CHECKING, Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from app.core.config import settings
from app.schemas.search import SearchRequest

if TYPE_CHECKING:
    from app.services.elasticsearch_service import ElasticsearchService


class MissingLLMError(RuntimeError):
    """generate 노드에 필요한 LLM 이 설정되지 않았을 때."""


class RagState(TypedDict, total=False):
    question: str
    index: str | None
    top_k: int
    history: list[dict[str, Any]]
    documents: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    answer: str


SYSTEM_PROMPT = """당신은 사내 지식베이스 RAG 어시스턴트입니다. 다음 원칙을 따르세요.

1. 우선 제공된 [Context] 안의 정보를 바탕으로 답변하세요.
2. Context 가 질문과 정확히 일치하지 않더라도, 부분적으로 관련된 정보가 있으면
   그 정보를 활용해 최대한 도움이 되는 답을 만드세요. 모르는 부분은 솔직히
   "제공된 문서에는 ~ 부분이 명시되어 있지 않습니다"라고 덧붙이세요.
3. Context 에 질문과 전혀 무관한 내용만 있을 때에만 "주어진 문서에서 답을 찾을 수
   없습니다." 라고 말하세요. 단, 그렇게 말할 때도 어떤 종류의 문서들이 검색됐는지
   한 줄로 요약해주면 사용자가 다음 질문을 떠올리는 데 도움이 됩니다.
4. 답변 끝에 실제로 활용한 문서의 id 를 [id1, id2] 형태로 짧게 표기하세요. 활용한
   문서가 없다면 빈 대괄호 []로 두면 됩니다."""


def _get_chat_model():
    """필요할 때만 LLM을 만든다 (테스트/오프라인 환경 보호)."""
    if not settings.openai_api_key:
        return None
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openai_api_key,
        temperature=0,
    )


def build_rag_graph(es_service: "ElasticsearchService"):
    async def retrieve(state: RagState) -> RagState:
        # 검색 페이지와 동일한 로직 사용 (hybrid + RRF, 필요 시 BM25).
        # 임베더가 있으면 hybrid, 없으면 BM25 — 챗 사용자는 모드를 직접 고르지 않으므로 자동 선택.
        mode = "hybrid" if es_service.embedder.is_available else "bm25"
        req = SearchRequest(
            query=state["question"],
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

    async def generate(state: RagState) -> RagState:
        question = state.get("question", "")
        docs = state.get("documents", [])

        if not docs:
            return {"answer": "주어진 문서에서 답을 찾을 수 없습니다."}

        llm = _get_chat_model()
        if llm is None:
            raise MissingLLMError(
                "채팅 응답 생성에 LLM 이 필요합니다. "
                "backend/.env 의 OPENAI_API_KEY 를 설정한 뒤 백엔드를 재시작하세요."
            )

        context_block = "\n\n".join(f"[{d['id']}] {d['text']}" for d in docs)
        user_prompt = f"질문: {question}\n\n[Context]\n{context_block}"

        result = await llm.ainvoke(
            [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_prompt)]
        )
        return {
            "answer": result.content if isinstance(result.content, str) else str(result.content)
        }

    workflow = StateGraph(RagState)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("generate", generate)
    workflow.set_entry_point("retrieve")
    workflow.add_edge("retrieve", "generate")
    workflow.add_edge("generate", END)
    return workflow.compile()
