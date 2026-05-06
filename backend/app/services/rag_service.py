from app.rag.graph import build_rag_graph
from app.schemas.chat import ChatRequest, ChatResponse, Citation


def _doc_to_citation(d: dict) -> Citation:
    return Citation(
        id=d["id"],
        index=d.get("index"),
        filename=d.get("filename"),
        chunk_index=d.get("chunk_index"),
        score=d["score"],
        text=d["text"],
    )


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
        documents = state.get("documents", [])
        used_ids = set(state.get("used_doc_ids", []))
        citations = [_doc_to_citation(d) for d in documents if d["id"] in used_ids]

        return ChatResponse(
            answer=state.get("answer", ""),
            search_query=state.get("search_query"),
            citations=citations,
        )


def get_rag_service() -> RagService:
    return RagService()
