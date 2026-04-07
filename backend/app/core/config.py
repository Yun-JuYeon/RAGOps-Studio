from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def _get_settings() -> Settings:
    return Settings()


settings = _get_settings()
