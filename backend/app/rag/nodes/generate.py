from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.core.llm import get_chat_model
from app.rag.prompts import SYSTEM_PROMPT
from app.rag.state import RagState


class _RagAnswer(BaseModel):
    answer: str = Field(description="질문에 대한 최종 답변 본문. 인용 표기를 포함하지 말 것.")
    used_doc_ids: list[str] = Field(
        default_factory=list,
        description=(
            "답변 작성 시 실제로 근거로 삼은 Context 문서의 id. "
            "단순히 검색되어 Context 에 포함된 것만으로는 채우지 말 것. "
            "근거가 없으면 빈 배열."
        ),
    )


async def generate(state: RagState) -> RagState:
    question = state.get("question", "")
    docs = state.get("documents", [])

    if not docs:
        return {"answer": "주어진 문서에서 답을 찾을 수 없습니다.", "used_doc_ids": []}

    llm = get_chat_model(schema=_RagAnswer)

    context_block = "\n\n".join(f"[{d['id']}] {d['text']}" for d in docs)
    user_prompt = f"질문: {question}\n\n[Context]\n{context_block}"

    result: _RagAnswer = await llm.ainvoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_prompt)]
    )

    # LLM 이 Context 에 없는 id 를 환각해서 넣을 수 있어 후보 풀로 한번 거른다.
    valid_ids = {d["id"] for d in docs}
    used = [doc_id for doc_id in result.used_doc_ids if doc_id in valid_ids]

    return {"answer": result.answer, "used_doc_ids": used}
