from app.rag.graph import build_rag_graph
from app.schemas.chat import ChatRequest, ChatResponse, Citation


class RagService:
    def __init__(self):
        self.graph = build_rag_graph()

    async def answer(self, req: ChatRequest) -> ChatResponse:
        # 마지막 user 메세지를 질문으로 사용
        question = next(
            (m.content for m in reversed(req.messages) if m.role == "user"),
            "",
        )
        state = await self.graph.ainvoke(
            {
                "question": question,
                "index": req.index,
                "top_k": req.top_k,
                "history": [m.model_dump() for m in req.messages],
            }
        )
        return ChatResponse(
            answer=state.get("answer", ""),
            search_query=state.get("search_query"),
            citations=[Citation(**c) for c in state.get("citations", [])],
        )


def get_rag_service() -> RagService:
    return RagService()
