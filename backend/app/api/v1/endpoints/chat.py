from fastapi import APIRouter, Depends, HTTPException

from app.rag.graph import MissingLLMError
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.rag_service import RagService, get_rag_service

router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    svc: RagService = Depends(get_rag_service),
):
    try:
        return await svc.answer(body)
    except MissingLLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
