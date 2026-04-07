"""LLM 인스턴스 헬퍼.

ChatOpenAI 를 lazy 하게 만들어서 OPENAI_API_KEY 가 없을 때
import 단계에서 죽지 않도록 한다. (반환값이 None 이면 호출자가 알아채야 함)
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings


def get_chat_model() -> Any | None:
    if not settings.openai_api_key:
        return None
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openai_api_key,
        temperature=0,
    )
