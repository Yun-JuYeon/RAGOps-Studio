"""generate 노드.

retrieve 가 모은 documents 를 context 로 LLM 에게 답변을 생성시킨다.
LLM 미설정 시 silent fallback 없이 MissingLLMError 를 던져 호출자가 안내하도록 한다.
"""

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.llm import get_chat_model
from app.rag.prompts import SYSTEM_PROMPT
from app.rag.state import MissingLLMError, RagState


async def generate(state: RagState) -> RagState:
    question = state.get("question", "")
    docs = state.get("documents", [])

    if not docs:
        return {"answer": "주어진 문서에서 답을 찾을 수 없습니다."}

    llm = get_chat_model()
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
