from __future__ import annotations

from typing import Any

from pydantic import BaseModel, SecretStr

from app.core.config import settings


def get_chat_model(schema: type[BaseModel] | None = None) -> Any:
    if not settings.openai_api_key:
        raise RuntimeError(
            "LLM 모델을 초기화할 수 없습니다. "
            "OPENAI_API_KEY 환경변수에 문제가 있습니다."
        )
    
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=SecretStr(settings.openai_api_key),
        temperature=0,
    )
    if schema is not None:
        return llm.with_structured_output(schema)
    return llm
