"""extract_keywords 노드.

사용자 자연어 질문 → 검색용 키워드 (query rewriting).
LLM 이 없거나 호출 실패 시 원본 질문을 그대로 사용한다.
"""

from langchain_core.messages import HumanMessage

from app.core.llm import get_chat_model
from app.rag.prompts import KEYWORD_EXTRACTION_PROMPT
from app.rag.state import RagState


_PREFIX_NOISE = ("키워드:", "Keywords:", "검색어:")


async def extract_keywords(state: RagState) -> RagState:
    question = state.get("question", "")
    llm = get_chat_model()
    if llm is None:
        return {"search_query": question}

    try:
        result = await llm.ainvoke(
            [HumanMessage(content=KEYWORD_EXTRACTION_PROMPT.format(question=question))]
        )
        extracted = (
            result.content if isinstance(result.content, str) else str(result.content)
        ).strip()

        # 모델이 종종 붙이는 머리말 제거
        for prefix in _PREFIX_NOISE:
            if extracted.lower().startswith(prefix.lower()):
                extracted = extracted[len(prefix):].strip()
        # 전체를 감싼 따옴표 제거
        extracted = extracted.strip('"\'`')

        if not extracted:
            extracted = question
    except Exception:  # noqa: BLE001
        extracted = question

    return {"search_query": extracted}
