import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Elasticsearch
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_username: str | None = None
    elasticsearch_password: str | None = None
    default_index: str = "ragops-documents"

    # LLM / Embeddings
    openai_api_key: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dims: int = 1536  # text-embedding-3-small 기준. 모델 바꾸면 같이 바꿀 것.
    llm_model: str = "gpt-4o-mini"

    # CORS — .env 에서는 쉼표 구분 문자열 또는 JSON 배열 모두 허용.
    #   CORS_ORIGINS=http://localhost:5173,https://ragops.example.com
    #   CORS_ORIGINS=["http://localhost:5173"]
    # NoDecode: pydantic-settings 가 list 필드를 JSON 으로 미리 파싱하는 동작을 끈다.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        s = v.strip()
        if not s:
            return []
        if s.startswith("["):
            return json.loads(s)
        return [item.strip() for item in s.split(",") if item.strip()]


@lru_cache
def _get_settings() -> Settings:
    return Settings()


settings = _get_settings()
