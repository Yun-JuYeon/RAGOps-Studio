"""extract_keywords 노드.

사용자 자연어 질문 → 검색용 키워드 (query rewriting).
LLM 이 없거나 호출 실패 시 원본 질문을 그대로 사용한다.
"""

import logging

from langchain_core.messages import HumanMessage

from app.core.llm import get_chat_model
from app.rag.prompts import KEYWORD_EXTRACTION_PROMPT
from app.rag.state import RagState

logger = logging.getLogger(__name__)


_PREFIX_NOISE = ("키워드:", "Keywords:", "검색어:")


async def extract_keywords(state: RagState) -> RagState:
    question = state.get("question", "")
    llm = get_chat_model()
    if llm is None:
        logger.info("extract_keywords: LLM 미설정 → 원본 질문을 search_query 로 사용")
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
            logger.warning("extract_keywords: LLM 이 빈 결과를 반환 → 원본 질문으로 폴백")
            extracted = question
    except Exception:  # noqa: BLE001
        # LLM 호출 실패해도 파이프라인 자체는 계속 진행되도록 폴백. 원인 추적을 위해 스택 남김.
        logger.warning("extract_keywords: LLM 호출 실패 → 원본 질문으로 폴백", exc_info=True)
        extracted = question

    return {"search_query": extracted}
