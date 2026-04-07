from fastapi import Depends

from app.rag.graph import build_rag_graph
from app.schemas.chat import ChatResponse, ChatRequest, Citation
from app.services.elasticsearch_service import ElasticsearchService, get_es_service


class RagService:
    def __init__(self, es_service: ElasticsearchService):
        self.es_service = es_service
        self.graph = build_rag_graph(es_service)

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
            citations=[Citation(**c) for c in state.get("citations", [])],
        )


def get_rag_service(
    es_service: ElasticsearchService = Depends(get_es_service),
) -> RagService:
    return RagService(es_service)
